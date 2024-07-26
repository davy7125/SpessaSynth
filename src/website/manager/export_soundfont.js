import { applySnapshotToMIDI } from '../../spessasynth_lib/midi_parser/midi_editor.js'
import { SoundFont2 } from '../../spessasynth_lib/soundfont/soundfont.js'
import {
    SpessaSynthGroup,
    SpessaSynthGroupEnd,
} from '../../spessasynth_lib/utils/loggin.js'
import { consoleColors } from '../../spessasynth_lib/utils/other.js'
import { trimSoundfont } from '../../spessasynth_lib/soundfont/write/soundfont_trimmer.js'
import { closeNotification, showNotification } from '../js/notification/notification.js'

/**
 * @this {Manager}
 * @returns {Promise<void>}
 * @private
 */
export async function _exportSoundfont()
{
    const path = "locale.exportAudio.formats.formats.soundfont.options.";
    showNotification(
        this.localeManager.getLocaleString(path + "title"),
        [
            {
                type: "toggle",
                translatePathTitle: path + "compress",
                attributes: {
                    "compress-toggle": "1",
                }
            },
            {
                type: "range",
                translatePathTitle: path + "quality",
                attributes: {
                    "min": "0",
                    "max": "10",
                    "value": "5"
                }
            },
            {
                type: "button",
                textContent: this.localeManager.getLocaleString(path + "confirm"),
                onClick: async n => {
                    const compressed = n.div.querySelector("input[compress-toggle='1']").checked;
                    const quality = parseInt(n.div.querySelector("input[type='range']").value) / 10;
                    closeNotification(n.id);
                    SpessaSynthGroup("%cExporting minified soundfont...",
                        consoleColors.info);
                    const mid = await this.seq.getMIDI();
                    const soundfont = new SoundFont2(mid.embeddedSoundFont || this.soundFont);
                    applySnapshotToMIDI(mid, await this.synth.getSynthesizerSnapshot());
                    trimSoundfont(soundfont, mid);
                    const binary = soundfont.write({compress: compressed, compressionQuality: quality});
                    const blob = new Blob([binary.buffer], {type: "audio/soundfont"});
                    let extension = soundfont.soundFontInfo["ifil"].split(".")[0] === "3" ? "sf3" : "sf2";
                    this.saveBlob(blob, `${soundfont.soundFontInfo['INAM'] || "unnamed"}.${extension}`);
                    SpessaSynthGroupEnd();
                }
            }
        ],
        99999999,
        true,
        this.localeManager
    );
}