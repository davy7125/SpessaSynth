import { getEvent, messageTypes, midiControllers } from '../../midi_parser/midi_message.js'
import { WorkletSequencerReturnMessageType } from './sequencer_message.js'


// an array with preset default values
const defaultControllerArray = new Int16Array(127);
// default values
defaultControllerArray[midiControllers.mainVolume] = 100;
defaultControllerArray[midiControllers.expressionController] = 127;
defaultControllerArray[midiControllers.pan] = 64;
defaultControllerArray[midiControllers.releaseTime] = 64;
defaultControllerArray[midiControllers.brightness] = 64;
defaultControllerArray[midiControllers.effects1Depth] = 40;

/**
 * plays from start to the target time, excluding note messages (to get the synth to the correct state)
 * @private
 * @param time {number} in seconds
 * @param ticks {number} optional MIDI ticks, when given is used instead of time
 * @returns {boolean} true if the midi file is not finished
 * @this {WorkletSequencer}
 */
export function _playTo(time, ticks = undefined)
{
    this.oneTickToSeconds = 60 / (120 * this.midiData.timeDivision);
    // process every non note message from the start
    this.synth.resetAllControllers();
    if(this.sendMIDIMessages)
    {
        this.sendMIDIMessage([messageTypes.reset]);
    }

    this._resetTimers()
    /**
     * save pitch bends here and send them only after
     * @type {number[]}
     */
    const pitchBends = Array(16).fill(8192);

    /**
     * Save controllers here and send them only after
     * @type {number[][]}
     */
    const savedControllers = [];
    for (let i = 0; i < 16; i++)
    {
        savedControllers.push(Array.from(defaultControllerArray));
    }

    while(true)
    {
        // find next event
        let trackIndex = this._findFirstEventIndex();
        let event = this.tracks[trackIndex][this.eventIndex[trackIndex]];
        if(ticks !== undefined)
        {
            if(event.ticks >= ticks)
            {
                break;
            }
        }
        else
        {
            if(this.playedTime >= time)
            {
                break;
            }
        }

        // skip note ons
        const info = getEvent(event.messageStatusByte);
        switch(info.status)
        {
            // skip note messages
            case messageTypes.noteOn:
            case messageTypes.noteOff:
                break;

            // skip pitch bend
            case messageTypes.pitchBend:
                pitchBends[info.channel] = event.messageData[1] << 7 | event.messageData[0];
                break;

            case messageTypes.controllerChange:
                // do not skip data entries
                const controllerNumber = event.messageData[0];
                if(
                    controllerNumber === midiControllers.dataDecrement           ||
                    controllerNumber === midiControllers.dataEntryMsb            ||
                    controllerNumber === midiControllers.dataDecrement           ||
                    controllerNumber === midiControllers.lsbForControl6DataEntry ||
                    controllerNumber === midiControllers.RPNLsb                  ||
                    controllerNumber === midiControllers.RPNMsb                  ||
                    controllerNumber === midiControllers.NRPNLsb                 ||
                    controllerNumber === midiControllers.NRPNMsb                 ||
                    controllerNumber === midiControllers.bankSelect              ||
                    controllerNumber === midiControllers.lsbForControl0BankSelect||
                    controllerNumber === midiControllers.resetAllControllers
                )
                {
                    if(this.sendMIDIMessages)
                    {
                        this.sendMIDIMessage([messageTypes.controllerChange | info.channel, controllerNumber, event.messageData[1]])
                    }
                    else
                    {
                        this.synth.controllerChange(info.channel, controllerNumber, event.messageData[1]);
                    }
                }
                else
                {
                    // Keep in mind midi ports to determine channel!!
                    const channel = info.channel + (this.midiPortChannelOffsets[this.midiPorts[trackIndex]] || 0);
                    if(savedControllers[channel] === undefined)
                    {
                        savedControllers[channel] = Array.from(defaultControllerArray);
                    }
                    savedControllers[channel][controllerNumber] = event.messageData[1];
                }
                break;

            // midiport: handle it and make sure that the saved controllers table is the same size as synth channels
            case messageTypes.midiPort:
                this._processEvent(event, trackIndex);
                if(this.synth.workletProcessorChannels.length > savedControllers.length)
                {
                    while(this.synth.workletProcessorChannels.length > savedControllers.length)
                    {
                        savedControllers.push(Array.from(defaultControllerArray));
                    }
                }
                break;

            default:
                this._processEvent(event, trackIndex);
                break;
        }

        this.eventIndex[trackIndex]++;
        // find next event
        trackIndex = this._findFirstEventIndex();
        let nextEvent = this.tracks[trackIndex][this.eventIndex[trackIndex]];
        if(nextEvent === undefined)
        {
            this.stop();
            return false;
        }
        this.playedTime += this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
    }

    // restoring saved controllers
    if(this.sendMIDIMessages)
    {
        // for all 16 channels
        for (let channelNumber = 0; channelNumber < 16; channelNumber++) {
            // send saved pitch bend
            this.sendMIDIMessage([messageTypes.pitchBend | channelNumber, pitchBends[channelNumber] & 0x7F, pitchBends[channelNumber] >> 7]);

            // every controller that has changed
            savedControllers[channelNumber].forEach((value, index) => {
                if(value !== defaultControllerArray[channelNumber])
                {
                    this.sendMIDIMessage([messageTypes.controllerChange | channelNumber, index, value])
                }
            })
        }
    }
    else
    {
        // for all synth channels
        for (let channelNumber = 0; channelNumber < this.synth.workletProcessorChannels.length; channelNumber++) {
            // restore pitch bends
            if(pitchBends[channelNumber] !== undefined) {
                this.synth.pitchWheel(channelNumber, pitchBends[channelNumber] >> 7, pitchBends[channelNumber] & 0x7F);
            }
            if(savedControllers[channelNumber] !== undefined)
            {
                // every controller that has changed
                savedControllers[channelNumber].forEach((value, index) => {
                    if(value !== defaultControllerArray[index])
                    {
                        this.synth.controllerChange(channelNumber, index, value);
                    }
                })
            }
        }
    }
    return true;
}

/**
 * Starts the playback
 * @param resetTime {boolean} If true, time is set to 0s
 * @this {WorkletSequencer}
 */
export function play(resetTime = false)
{

    // reset the time if necesarry
    if(resetTime)
    {
        this.currentTime = 0;
        return;
    }

    if(this.currentTime >= this.duration)
    {
        this.currentTime = 0;
        return;
    }

    // unpause if paused
    if(this.paused)
    {
        // adjust the start time
        this._recalculateStartTime(this.pausedTime)
        this.pausedTime = undefined;
    }

    this.playingNotes.forEach(n => {
        this.synth.noteOn(n.channel, n.midiNote, n.velocity);
    });
    this.setProcessHandler();
}

/**
 * @this {WorkletSequencer}
 * @param ticks {number}
 */
export function setTimeTicks(ticks)
{
    this.stop();
    this.playingNotes = [];
    this.pausedTime = undefined;
    const isNotFinished = this._playTo(0, ticks);
    this._recalculateStartTime(this.playedTime);
    if(!isNotFinished)
    {
        return;
    }
    this.play();
    this.post(WorkletSequencerReturnMessageType.timeChange, this.currentTime);
    this.post(WorkletSequencerReturnMessageType.resetRendererIndexes);
}

/**
 * @param time
 * @private
 * @this {WorkletSequencer}
 */
export function _recalculateStartTime(time)
{
    this.absoluteStartTime = currentTime - time / this._playbackRate;
}