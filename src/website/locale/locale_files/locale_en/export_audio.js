export const exportAudio = {
    button: {
        title: "Save audio",
        description: "Save audio as WAV, MIDI, SF2 or RMI file"
    },

    formats: {
        title: "Choose format",
        formats: {
            wav: {
                button: {
                    title: "WAV audio",
                    description: "Export the song with modifications as a .wav audio file"
                },
                options: {
                    title: "WAV export options",
                    confirm: "Export",
                    normalizeVolume: {
                        title: "Normalize volume",
                        description: "Keep the volume at the same level, no matter how loud or quiet the MIDI is. Recommended.",
                    },
                    additionalTime: {
                        title: "Additional time (s)",
                        description: "Additional time at the end of the song to allow for the sound to fade. (seconds)",
                    },

                    separateChannels: {
                        title: "Separate channels",
                        description: "Save each channel as a separate file. Useful for things like oscilloscope viewers. Note that this disables reverb and chorus.",
                        saving: {
                            title: "Channel files",
                            save: "Save channel {0}"
                        }
                    }
                },
                exportMessage: {
                    message: "Exporting WAV audio...",
                    estimated: "Remaining:",
                    convertWav: "Converting to wav...",
                }
            },

            midi: {
                button: {
                    title: "Modified MIDI",
                    description: "Export the MIDI file with the controller and instrument changes applied"
                }
            },

            soundfont: {
                button: {
                    title: "Trimmed soundfont",
                    description: "Export the soundfont trimmed to only use instruments and samples that the MIDI file uses"
                },

                options: {
                    title: "SF export options",
                    confirm: "Export",
                    compress: {
                        title: "Compress",
                        description: "Compress samples with lossy Ogg Vorbis compression if uncompressed. Significantly reduces the file size." +
                            "If the soundfont was already compressed, it won't be uncompressed even if this option is disabled"
                    },
                    quality: {
                        title: "Compression quality",
                        description: "The quality of compression. Higher is better"
                    }
                }
            },

            rmidi: {
                button: {
                    title: "Embedded MIDI (.rmi)",
                    description: "Export the modified MIDI with the embedded trimmed soundfont as a single file. " +
                        "Note that this format isn't widely supported"
                },

                progress: {
                    title: "Exporting embeded MIDI...",
                    loading: "Loading Soundfont and MIDI...",
                    modifyingMIDI: "Modifying MIDI...",
                    modifyingSoundfont: "Trimming Soundfont...",
                    saving: "Saving RMIDI...",
                    done: "Done!"
                },

                options: {
                    title: "RMIDI export options",
                    confirm: "Export",
                    compress: {
                        title: "Compress",
                        description: "Compress the Soundfont with lossy Ogg Vorbis compression. Significantly reduces the file size. Recommended."
                    },
                    quality: {
                        title: "Compression quality",
                        description: "The quality of compression. Higher is better."
                    },
                    songTitle: {
                        title: "Title",
                        description: "The song's title",
                    },
                    album: {
                        title: "Album",
                        description: "The song's album"
                    },
                    artist: {
                        title: "Artist",
                        description: "The song's artist"
                    },
                    albumCover: {
                        title: "Album cover",
                        description: "The song's album cover",
                    },
                    bankOffset: {
                        title: "Bank offset",
                        description: "The bank offset of the file. Value of 0 is recommended. Only change if you know what you're doing.",
                    }
                }
            }
        }
    }
}