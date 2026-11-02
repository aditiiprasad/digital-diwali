/**
 * Radio playlist (YouTube only). Set `ytId` to the 11-character video ID
 * (the part after `watch?v=`). Unplayable entries are skipped with a toast.
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  ytId: string;
}

export const playlist: Track[] = [
  {
    id: 'yt-happy-diwali',
    title: 'Happy Diwali (Home Delivery)',
    artist: 'T-Series',
    ytId: 'aZj-MEqy2CM',
  },
  {
    id: 'yt-party-shuru',
    title: 'Abhi Toh Party Shuru Hui Hai',
    artist: 'Badshah · Khoobsurat',
    ytId: '8LZgzAZ2lpQ',
  },
  {
    id: 'yt-tamma-tamma',
    title: 'Tamma Tamma Again',
    artist: 'Badrinath Ki Dulhania',
    ytId: 'EEX_XM6SxmY',
  },
  {
    id: 'yt-move-lakk',
    title: 'Move Your Lakk',
    artist: 'Noor · Badshah',
    ytId: 'kMRRIMmICmM',
  },
  {
    id: 'yt-high-heels',
    title: 'High Heels Te Nachche',
    artist: 'Ki & Ka · Yo Yo Honey Singh',
    ytId: 'N_KpjLhJa1k',
  },
  {
    id: 'yt-chhaliya',
    title: 'Chhaliya',
    artist: 'Tashan · Vishal-Shekhar',
    ytId: 'YPpOqfIQ5ME',
  },
  {
    id: 'yt-love-mera-hit',
    title: 'Love Mera Hit Hit',
    artist: 'Pritam',
    ytId: 'o6ojv9uUezU',
  },
  {
    id: 'yt-crazy-kiya-re',
    title: 'Crazy Kiya Re',
    artist: 'Dhoom:2 · Sunidhi Chauhan',
    ytId: 'J2Bh68GTUOU',
  },
  {
    id: 'yt-sharara',
    title: 'Sharara',
    artist: 'Mere Yaar Ki Shaadi Hai',
    ytId: 'LwjR20lX4aY',
  },
  {
    id: 'yt-khwab-dekhe',
    title: 'Khwab Dekhe (Sexy Lady)',
    artist: 'Race',
    ytId: 'kCQ6zaHDXj4',
  },
  {
    id: 'yt-tumhe-jo',
    title: 'Tumhe Jo Maine Dekha',
    artist: 'Main Hoon Na',
    ytId: '84TjXsRHf6Q',
  },
  {
    id: 'yt-yeh-ladka',
    title: 'Yeh Ladka Hai Allah',
    artist: 'Kabhi Khushi Kabhie Gham',
    ytId: 'BE8_rNJOQ-0',
  },
  {
    id: 'yt-soniya',
    title: 'You Are My Soniya',
    artist: 'Kabhi Khushi Kabhie Gham',
    ytId: 'DwUgoUhgzLo',
  },
  {
    id: 'yt-gerua',
    title: 'Gerua',
    artist: 'Dilwale · Arijit Singh',
    ytId: 'AEIVhBS6baE',
  },
  {
    id: 'yt-pretty-woman',
    title: 'Pretty Woman',
    artist: 'Kal Ho Naa Ho',
    ytId: '70QpN7DvaK4',
  },
];
