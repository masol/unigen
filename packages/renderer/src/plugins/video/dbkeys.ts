
export const DbKeys = {
    // input-manangers.
    scripts: "scripts",
    synopsis: "synopsis",
    character_specifications: 'character_specifications',
    book_name: 'book_name',
    requirements: 'requirements',
    // spec settings.
    aspectRatio: "aspect-ratio",
    resolution: "resolution",
    frameRate: "frame-rate",
    duration: "duration",
    pace: "pace",
    language: "language",
    audience: "audience",
    style: "style",
    ScriptbyId: (id: string) => `script_${id}`
} as const;