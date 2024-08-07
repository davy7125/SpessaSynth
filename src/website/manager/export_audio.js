import { closeNotification, showNotification } from '../js/notification/notification.js'
import { Synthetizer } from '../../spessasynth_lib/synthetizer/synthetizer.js'
import { formatTime } from '../../spessasynth_lib/utils/other.js'
import { audioBufferToWav } from '../../spessasynth_lib/utils/buffer_to_wav.js'
import { WORKLET_URL_ABSOLUTE } from '../../spessasynth_lib/synthetizer/worklet_url.js'
import { ANIMATION_REFLOW_TIME } from '../js/utils/animation_utils.js'

const RENDER_AUDIO_TIME_INTERVAL = 1000;

/**
 * @this {Manager}
 * @param normalizeAudio {boolean}
 * @param additionalTime {number}
 * @param separateChannels {boolean}
 * @param meta {WaveMetadata}
 * @returns {Promise<void>}
 * @private
 */
export async function _doExportAudioData(normalizeAudio = true, additionalTime = 2, separateChannels = false, meta = {})
{
    this.isExporting = true;
    if(!this.seq)
    {
        throw new Error("No sequencer active");
    }
    // get locales
    const exportingMessage = manager.localeManager.getLocaleString(`locale.exportAudio.formats.formats.wav.exportMessage.message`);
    const estimatedMessage = manager.localeManager.getLocaleString(`locale.exportAudio.formats.formats.wav.exportMessage.estimated`);
    const notification = showNotification(
        exportingMessage,
        [
            { type: 'text', textContent: estimatedMessage + " (...)" },
            { type: 'progress' }
        ],
        9999999,
        false
    );
    const parsedMid = await this.seq.getMIDI();
    const duration = parsedMid.duration + additionalTime;
    // prepare audio context
    const offline = new OfflineAudioContext({
        numberOfChannels: separateChannels ? 32 : 2,
        sampleRate: this.context.sampleRate,
        length: this.context.sampleRate * duration
    });
    await offline.audioWorklet.addModule(new URL("../../spessasynth_lib/" + WORKLET_URL_ABSOLUTE, import.meta.url));

    /**
     * take snapshot of the real synth
     * @type {SynthesizerSnapshot}
     */
    const snapshot = await this.synth.getSynthesizerSnapshot();

    const soundfont = parsedMid.embeddedSoundFont || this.soundFont;
    /**
     * Prepare synthesizer
     * @type {Synthetizer}
     */
    let synth;
    try
    {
        synth = new Synthetizer(offline.destination, soundfont, false, {
            parsedMIDI: parsedMid,
            snapshot: snapshot,
            oneOutput: separateChannels
        }, {
            reverbEnabled: true,
            chorusEnabled: true,
            chorusConfig: undefined,
            reverbImpulseResponse: this.impulseResponse
        });
    }
    catch (e)
    {
        showNotification(
            this.localeManager.getLocaleString("locale.warnings.warning"),
            [{
                type: "text",
                textContent: this.localeManager.getLocaleString("locale.warnings.outOfMemory")
            }]
        )
        throw e;
    }

    const detailMessage = notification.div.getElementsByTagName("p")[0];
    const progressDiv = notification.div.getElementsByClassName("notification_progress")[0];

    const RATI_SECONDS = RENDER_AUDIO_TIME_INTERVAL / 1000;
    let rendered = synth.currentTime;
    let estimatedTime = duration;
    const smoothingFactor = 0.1; // for smoothing estimated time

    const interval = setInterval(() => {
        // calculate estimated time
        let hasRendered = synth.currentTime - rendered;
        rendered = synth.currentTime;
        const progress = synth.currentTime / duration;
        progressDiv.style.width = `${progress * 100}%`;
        const speed = hasRendered / RATI_SECONDS;
        const estimated = (1 - progress) / speed * duration;
        if (estimated === Infinity)
        {
            return;
        }
        // smooth out estimated using exponential moving average
        estimatedTime = smoothingFactor * estimated + (1 - smoothingFactor) * estimatedTime;
        detailMessage.innerText = `${estimatedMessage} ${formatTime(estimatedTime).time}`
    }, RENDER_AUDIO_TIME_INTERVAL);

    const buf = await offline.startRendering();
    progressDiv.style.width = "100%";
    // clear intervals and save file
    clearInterval(interval);
    detailMessage.innerText = this.localeManager.getLocaleString("locale.exportAudio.formats.formats.wav.exportMessage.convertWav");
    // let the browser show
    await new Promise(r => setTimeout(r, ANIMATION_REFLOW_TIME));
    if(!separateChannels)
    {
        this.saveBlob(audioBufferToWav(buf, normalizeAudio, 0, meta), `${this.seqUI.currentSongTitle || 'unnamed_song'}.wav`,);
    }
    else
    {
        const separatePath = `locale.exportAudio.formats.formats.wav.options.separateChannels.saving.`;
        /**
         * @type {NotificationContent[]}
         */
        const content = [];
        const usedChannels = new Set();
        for(const p of parsedMid.usedChannelsOnTrack)
        {
            p.forEach(c => usedChannels.add(c));
        }
        for (let i = 0; i < 16; i++)
        {
            if(!usedChannels.has(i))
            {
                continue;
            }
            content.push({
                type: "button",
                textContent: this.localeManager.getLocaleString(separatePath + "save", [i + 1]),
                onClick: async (n, target) => {

                    const text = target.textContent;
                    target.textContent = this.localeManager.getLocaleString("locale.exportAudio.formats.formats.wav.exportMessage.convertWav");
                    await new Promise(r => setTimeout(r, ANIMATION_REFLOW_TIME));

                    const audioOut = audioBufferToWav(buf, false, i * 2);
                    const fileName = `${i + 1} - ${snapshot.channelSnapshots[i].patchName}.wav`;
                    this.saveBlob(audioOut, fileName);
                    target.classList.add("green_button");
                    target.textContent = text;
                }
            });
        }
        const n = showNotification(
            this.localeManager.getLocaleString(separatePath + "title"),
            content,
            99999999,
            true,
            undefined,
            {
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-around"
            }
        );
        n.div.style.width = '30rem'
    }
    closeNotification(notification.id);
    this.isExporting = false;
}

/**
 * @this {Manager}
 * @returns {Promise<void>}
 * @private
 */
export async function _exportAudioData()
{
    if(this.isExporting)
    {
        return;
    }
    const wavPath = `locale.exportAudio.formats.formats.wav.options.`;
    const metadataPath = "locale.exportAudio.formats.metadata.";
    const verifyDecode = (type, def, decoder) => {
        return this.seq.midiData.RMIDInfo?.[type] === undefined ? def : decoder.decode(this.seq.midiData.RMIDInfo?.[type])
    }
    const encoding = verifyDecode("IENC", "ascii", new TextDecoder());
    const decoder = new TextDecoder(encoding);

    const startAlbum = verifyDecode("IPRD", "", decoder);
    const startArtist = verifyDecode("IART", "", decoder);
    const startGenre = verifyDecode("IGNR", "", decoder);
    /**
     * @type {NotificationContent[]}
     */
    const WAV_OPTIONS = [
        {
            type: "toggle",
            translatePathTitle: wavPath + "normalizeVolume",
            attributes: {
                "normalize-volume-toggle": "1",
                "checked": "true"
            }
        },
        {
            type: "input",
            translatePathTitle: wavPath + "additionalTime",
            attributes: {
                "value": "2",
                "type": "number"
            }
        },
        {
            type: "toggle",
            translatePathTitle: wavPath + "separateChannels",
            attributes: {
                "separate-channels-toggle": "1"
            }
        },
        {
            type: "input",
            translatePathTitle: metadataPath + "songTitle",
            attributes: {
                "name": "song_title",
                "type": "text",
                "value": this.seqUI.currentSongTitle
            }
        },
        {
            type: "input",
            translatePathTitle: metadataPath + "album",
            attributes: {
                "value": startAlbum,
                "name": "album",
                "type": "text"
            }
        },
        {
            type: "input",
            translatePathTitle: metadataPath + "artist",
            attributes: {
                "value": startArtist,
                "name": "artist",
                "type": "text"
            }
        },
        {
            type: "input",
            translatePathTitle: metadataPath + "genre",
            attributes: {
                "value": startGenre,
                "name": "genre",
                "type": "text"
            }
        },
        {
            type: "button",
            textContent: this.localeManager.getLocaleString(wavPath + "confirm"),
            onClick: n => {
                closeNotification(n.id);
                const normalizeVolume = n.div.querySelector("input[normalize-volume-toggle]").checked;
                const additionalTime = n.div.querySelector("input[type='number']").value;
                const separateChannels = n.div.querySelector("input[separate-channels-toggle]").checked;
                const artist = n.div.querySelector("input[name='artist']").value;
                const album = n.div.querySelector("input[name='album']").value;
                const title = n.div.querySelector("input[name='song_title']").value;
                const genre = n.div.querySelector("input[name='genre']").value;
                /**
                 * @type {WaveMetadata}
                 */
                const metadata = {
                    artist: artist.length > 0 ? artist : undefined,
                    album: album.length > 0 ? album : undefined,
                    title: title.length > 0 ? title : undefined,
                    genre: genre.length > 0 ? genre : undefined,
                }

                this._doExportAudioData(normalizeVolume, parseInt(additionalTime), separateChannels, metadata);
            }
        }
    ];

    /**
     * @type {NotificationContent[]}
     */
    showNotification(
        this.localeManager.getLocaleString(wavPath + "title"),
        WAV_OPTIONS,
        9999999,
        true,
        this.localeManager
    );
}