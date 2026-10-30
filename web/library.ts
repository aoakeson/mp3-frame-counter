/** One example MP3 in samples/library/, served at /library/<slug>.mp3 with a <slug>.jpg cover. */
export interface Track {
  slug: string;
  title: string;
  /** Composer and performer. */
  by: string;
  seconds: number;
  /** Bitrate and sample rate, as ffprobe reports them. */
  format: string;
}

// All public domain or CC0, covers included. Sources and licenses: samples/library/CREDITS.md.
export const LIBRARY: Track[] = [
  {
    slug: "the-entertainer",
    title: "The Entertainer",
    by: "Scott Joplin · James Brigham",
    seconds: 306,
    format: "128 kbps · 44.1 kHz",
  },
  {
    slug: "clair-de-lune",
    title: "Clair de Lune",
    by: "Debussy · U.S. Air Force Band of Flight",
    seconds: 242,
    format: "128 kbps · 44.1 kHz",
  },
  {
    slug: "stars-and-stripes-forever",
    title: "The Stars and Stripes Forever",
    by: "Sousa · U.S. Air Force Band",
    seconds: 207,
    format: "160 kbps · 44.1 kHz",
  },
  {
    slug: "minute-waltz",
    title: "Minute Waltz, Op. 64 No. 1",
    by: "Chopin · Musopen",
    seconds: 107,
    format: "VBR · 48 kHz",
  },
  {
    slug: "maple-leaf-rag",
    title: "Maple Leaf Rag",
    by: "Joplin · U.S. Air Force Strolling Strings",
    seconds: 125,
    format: "320 kbps · 44.1 kHz",
  },
  {
    slug: "ode-to-joy",
    title: "Ode to Joy",
    by: "Beethoven · U.S. Air Force Band of the Rockies",
    seconds: 220,
    format: "128 kbps · 44.1 kHz",
  },
  {
    slug: "raindrop-prelude",
    title: "Raindrop Prelude, Op. 28 No. 15",
    by: "Chopin · Musopen",
    seconds: 295,
    format: "VBR · 48 kHz",
  },
  {
    slug: "the-liberty-bell",
    title: "The Liberty Bell",
    by: "Sousa · U.S. Marine Band",
    seconds: 215,
    format: "320 kbps · 48 kHz",
  },
  {
    slug: "sunflower-slow-drag",
    title: "Sunflower Slow Drag",
    by: "Joplin & Hayden · U.S. Marine Band",
    seconds: 199,
    format: "VBR · 44.1 kHz",
  },
  {
    slug: "nocturne-op-27-no-1",
    title: "Nocturne, Op. 27 No. 1",
    by: "Chopin · Musopen",
    seconds: 352,
    format: "VBR · 44.1 kHz",
  },
  {
    slug: "radetzky-march",
    title: "Radetzky March",
    by: "Strauss I · U.S. Marine Band",
    seconds: 153,
    format: "320 kbps · 44.1 kHz",
  },
  {
    slug: "palm-leaf-rag",
    title: "Palm Leaf Rag",
    by: "Scott Joplin · James Brigham",
    seconds: 266,
    format: "128 kbps · 44.1 kHz",
  },
  {
    slug: "grande-valse-brillante",
    title: "Grande Valse Brillante, Op. 18",
    by: "Chopin · Musopen",
    seconds: 319,
    format: "VBR · 48 kHz",
  },
  {
    slug: "el-capitan",
    title: "El Capitan",
    by: "Sousa · U.S. Marine Band",
    seconds: 141,
    format: "320 kbps · 48 kHz",
  },
  {
    slug: "the-thunderer",
    title: "The Thunderer",
    by: "Sousa · U.S. Army Band",
    seconds: 169,
    format: "160 kbps · 44.1 kHz",
  },
  {
    slug: "brian-borus-march",
    title: "Brian Boru's March",
    by: "Traditional · U.S. Marine Band",
    seconds: 147,
    format: "320 kbps · 44.1 kHz",
  },
  {
    slug: "auld-lang-syne",
    title: "Auld Lang Syne",
    by: "Traditional · U.S. Army Band",
    seconds: 59,
    format: "160 kbps · 44.1 kHz",
  },
  {
    slug: "reveille",
    title: "Reveille",
    by: "U.S. Army Band",
    seconds: 27,
    format: "160 kbps · 44.1 kHz",
  },
  {
    slug: "apollo-8-christmas",
    title: "Apollo 8 Christmas Eve",
    by: "NASA · Apollo 8 crew, 1968",
    seconds: 13,
    format: "192 kbps · 44.1 kHz",
  },
  {
    slug: "apollo-11-eagle-has-landed",
    title: "The Eagle Has Landed",
    by: "NASA · Apollo 11, 1969",
    seconds: 5,
    format: "MPEG-2 · 16 kHz",
  },
];
