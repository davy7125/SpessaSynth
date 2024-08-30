import { decibelAttenuationToGain, timecentsToSeconds } from './unit_converter.js'
import { generatorTypes } from '../../../soundfont/read_sf2/generators.js'

/**
 * volume_envelope.js
 * purpose: applies a volume envelope for a given voice
 */

export const VOLUME_ENVELOPE_SMOOTHING_FACTOR = 0.001;

const DB_SILENCE = 100;
const PERCEIVED_DB_SILENCE = 96;

/**
 * VOL ENV STATES:
 * 0 - delay
 * 1 - attack
 * 2 - hold/peak
 * 3 - decay
 * 4 - sustain
 * release is indicated by isInRelease property
 */

export class WorkletVolumeEnvelope
{
    /**
     * @param sampleRate {number} Hz
     */
    constructor(sampleRate)
    {
        this.sampleRate = sampleRate;
    }

    /**
     * The envelope's current time in samples
     * @type {number}
     */
    currentSampleTime = 0;

    /**
     * The sample rate in Hz
     * @type {number}
     */
    sampleRate;
    /**
     * The current attenuation of the envelope in dB
     * @type {number}
     */
    currentAttenuationDb = DB_SILENCE;
    /**
     * The current stage of the volume envelope
     * @type {0|1|2|3|4}
     */
    state = 0;
    /**
     * The dB attenuation of the envelope when it entered the release stage
     * @type {number}
     */
    releaseStartDb = 100;
    /**
     * The time in samples relative to the start of the envelope
     * @type {number}
     */
    releaseStartTimeSamples = 0;
    /**
     * The current gain applied to the voice in the release stage
     * @type {number}
     */
    currentReleaseGain = 1;

    /**
     * The attack duration in samples
     * @type {number}
     */
    attackDuration = 0;
    /**
     * The decay duration in samples
     * @type {number}
     */
    decayDuration = 0;

    /**
     * The release duration in samples
     * @type {number}
     */
    releaseDuration = 0;

    /**
     * The voice's absolute attenuation in dB
     * @type {number}
     */
    attenuation = 0;

    /**
     * The voice's sustain amount in dB, absolute
     * @type {number}
     */
    sustainDb = 0;

    /**
     * The time in samples to the end of delay stage, relative to start of the envelope
     * @type {number}
     */
    delayEnd = 0;

    /**
     * The time in samples to the end of attack stage, relative to start of the envelope
     * @type {number}
     */
    attackEnd = 0;

    /**
     * The time in samples to the end of hold stage, relative to start of the envelope
     * @type {number}
     */
    holdEnd = 0;

    /**
     * The time in samples to the end of decay stage, relative to start of the envelope
     * @type {number}
     */
    decayEnd = 0;

    /**
     * Starts the release phase in the envelope
     * @param voice {WorkletVoice} the voice this envelope belongs to
     */
    static startRelease(voice)
    {
        voice.volumeEnvelope.releaseStartTimeSamples = voice.volumeEnvelope.currentSampleTime;
        voice.volumeEnvelope.currentReleaseGain = decibelAttenuationToGain(voice.volumeEnvelope.currentAttenuationDb);
        WorkletVolumeEnvelope.recalculate(voice);
    }

    /**
     * Recalculates the envelope
     * @param voice {WorkletVoice} the voice this envelope belongs to
     */
    static recalculate(voice)
    {
        const env = voice.volumeEnvelope;
        const timecentsToSamples = tc =>
        {
            return Math.floor(timecentsToSeconds(tc) * env.sampleRate);
        }
        // calculate absolute times (they can change so we have to recalculate every time
        env.attenuation = voice.modulatedGenerators[generatorTypes.initialAttenuation] / 10; // divide by ten to get decibelts
        env.sustainDb = voice.volumeEnvelope.attenuation + voice.modulatedGenerators[generatorTypes.sustainVolEnv] / 10;

        // calculate durations
        env.attackDuration = timecentsToSamples(voice.modulatedGenerators[generatorTypes.attackVolEnv]);

        // decay: sfspec page 35: the time is for change from attenuation to -100dB
        // therefore we need to calculate the real time
        // (changing from attenuation to sustain instead of -100dB)
        const fullChange = voice.modulatedGenerators[generatorTypes.decayVolEnv];
        const keyNumAddition = ((60 - voice.targetKey) * voice.modulatedGenerators[generatorTypes.keyNumToVolEnvDecay]);
        const fraction = (env.sustainDb - env.attenuation) / (100 - env.attenuation);
        env.decayDuration = timecentsToSamples(fullChange + keyNumAddition) * fraction;

        env.releaseDuration = timecentsToSamples(voice.modulatedGenerators[generatorTypes.releaseVolEnv]);

        // calculate absolute end times for the values
        env.delayEnd = timecentsToSamples(voice.modulatedGenerators[generatorTypes.delayVolEnv]);
        env.attackEnd = env.attackDuration + env.delayEnd;

        // make sure to take keyNumToVolEnvHold into account!!!
        const holdExcursion = (60 - voice.targetKey) * voice.modulatedGenerators[generatorTypes.keyNumToVolEnvHold];
        env.holdEnd = timecentsToSamples(voice.modulatedGenerators[generatorTypes.holdVolEnv]
                + holdExcursion)
                + env.attackEnd;

        env.decayEnd = env.decayDuration + env.holdEnd;
        // check if voice is in release
        if(voice.isInRelease)
        {
            switch (env.state)
            {
                case 0:
                    env.releaseStartDb = DB_SILENCE;
                    break;

                case 1:
                    // attack phase: get linear gain of the attack phase when release started
                    // and turn it into db as we're ramping the db up linearly
                    // (to make volume go down exponentially)
                    // attack is linear (in gain) so we need to do get db from that
                    let elapsed = 1 - ((env.attackEnd - env.releaseStartTimeSamples) / env.attackDuration);
                    // calculate the gain that the attack would have
                    let attackGain = elapsed * decibelAttenuationToGain(env.attenuation);

                    // turn that into db
                    env.releaseStartDb = 20 * Math.log10(attackGain) * -1;
                    break;

                case 2:
                    env.releaseStartDb = env.attenuation;
                    break;

                case 3:
                    env.releaseStartDb = (1 - (env.decayEnd - env.releaseStartTimeSamples) / env.decayDuration) * (env.sustainDb - env.attenuation) + env.attenuation;
                    break;

                case 4:
                    env.releaseStartDb = env.sustainDb;
                    break;

                default:
                    env.releaseStartDb = env.currentAttenuationDb;
            }
        }
    }

    /**
     * Gets interpolated gain
     * @param env {WorkletVolumeEnvelope}
     * @param attenuationDb {number} in decibels
     * @param smoothingFactor {number}
     * @returns {number} the gain value
     */
    static getInterpolatedGain(env, attenuationDb, smoothingFactor)
    {
        // interpolate attenuation to prevent clicking
        env.currentAttenuationDb += (attenuationDb - env.currentAttenuationDb) * smoothingFactor;
        return decibelAttenuationToGain(env.currentAttenuationDb);
    }

    /**
     * Applies volume envelope gain to the given output buffer
     * @param voice {WorkletVoice} the voice we're working on
     * @param audioBuffer {Float32Array} the audio buffer to modify
     * @param centibelOffset {number} the centibel offset of volume, for modLFOtoVolume
     * @param smoothingFactor {number} the adjusted smoothing factor for the envelope
     */
    static apply(voice, audioBuffer,  centibelOffset, smoothingFactor)
    {
        const env = voice.volumeEnvelope;
        let decibelOffset = centibelOffset / 10;
    
        // RELEASE PHASE
        if(voice.isInRelease)
        {
            // release needs a more aggressive smoothing factor
            // as the instant notes don't end instantly when they should
            const releaseSmoothingFactor = smoothingFactor * 10;
            let elapsedRelease = env.currentSampleTime - env.releaseStartTimeSamples;
            let dbDifference = DB_SILENCE - env.releaseStartDb;
            let db = 0;
            for (let i = 0; i < audioBuffer.length; i++)
            {
                db = (elapsedRelease / env.releaseDuration) * dbDifference + env.releaseStartDb;
                let gain = decibelAttenuationToGain(db + decibelOffset);
                env.currentReleaseGain += (gain - env.currentReleaseGain) * releaseSmoothingFactor;
                audioBuffer[i] *= env.currentReleaseGain;
                env.currentSampleTime++;
                elapsedRelease++;
            }
    
            if(db >= PERCEIVED_DB_SILENCE)
            {
                voice.finished = true;
            }
            return;
        }

        let filledBuffer = 0;
        switch(env.state)
        {
            case 0:
                // delay phase, no sound is produced
                while(env.currentSampleTime < env.delayEnd)
                {
                    env.currentAttenuationDb = DB_SILENCE;
                    audioBuffer[filledBuffer] = 0;
    
                    env.currentSampleTime++
                    if(++filledBuffer >= audioBuffer.length)
                    {
                        return;
                    }
                }
                env.state++;
            // fallthrough
    
            case 1:
                // attack phase: ramp from 0 to attenuation
                while(env.currentSampleTime < env.attackEnd)
                {
                    // Special case: linear gain ramp instead of linear db ramp
                    let linearAttenuation = 1 - (env.attackEnd - env.currentSampleTime) / env.attackDuration; // 0 to 1
                    audioBuffer[filledBuffer] *= linearAttenuation * decibelAttenuationToGain(env.attenuation + decibelOffset)
    
                    // set current attenuation to peak as its invalid during this phase
                    env.currentAttenuationDb = env.attenuation;
    
                    env.currentSampleTime++;
                    if(++filledBuffer >= audioBuffer.length)
                    {
                        return;
                    }
                }
                env.state++;
            // fallthrough
    
            case 2:
                // hold/peak phase: stay at attenuation
                while(env.currentSampleTime < env.holdEnd)
                {
                    audioBuffer[filledBuffer] *= WorkletVolumeEnvelope.getInterpolatedGain(env, env.attenuation + decibelOffset, smoothingFactor);
    
                    env.currentSampleTime++;
                    if(++filledBuffer >= audioBuffer.length)
                    {
                        return;
                    }
                }
                env.state++;
            // fallthrough
    
            case 3:
                // decay phase: linear ramp from attenuation to sustain
                const dbDifference = env.sustainDb - env.attenuation;
                while(env.currentSampleTime++ < env.decayEnd)
                {
                    const newAttenuation = (1 - (env.decayEnd - env.currentSampleTime) / env.decayDuration) * dbDifference + env.attenuation;
                    audioBuffer[filledBuffer] *= WorkletVolumeEnvelope.getInterpolatedGain(env, newAttenuation + decibelOffset, smoothingFactor);
    
                    env.currentSampleTime++;
                    if(++filledBuffer >= audioBuffer.length)
                    {
                        return;
                    }
                }
                env.state++;
            // fallthrough
    
            case 4:
                // sustain phase: stay at sustain
                while(true)
                {
                    audioBuffer[filledBuffer] *= WorkletVolumeEnvelope.getInterpolatedGain(env, env.sustainDb + decibelOffset, smoothingFactor);
                    env.currentSampleTime++;
                    if(++filledBuffer >= audioBuffer.length)
                    {
                        return;
                    }
                }
    
        }
    }
}