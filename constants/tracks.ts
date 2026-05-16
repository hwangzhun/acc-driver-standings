export const TRACKS: Record<string, { zh: string; en: string }> = {
    monza: { zh: '蒙扎赛道', en: 'Monza' },
    zolder: { zh: '佐尔德赛道', en: 'Zolder' },
    brands_hatch: { zh: '布兰兹哈奇赛道', en: 'Brands Hatch' },
    silverstone: { zh: '银石赛道', en: 'Silverstone' },
    paul_ricard: { zh: '保罗里卡德赛道', en: 'Paul Ricard' },
    misano: { zh: '米萨诺赛道', en: 'Misano' },
    spa: { zh: '斯帕赛道', en: 'Spa' },
    nurburgring: { zh: '纽博格林南环赛道', en: 'Nürburgring' },
    barcelona: { zh: '巴塞罗那赛道', en: 'Barcelona' },
    hungaroring: { zh: '亨格罗宁赛道', en: 'Hungaroring' },
    zandvoort: { zh: '赞德沃特赛道', en: 'Zandvoort' },
    kyalami: { zh: '卡亚拉米赛道', en: 'Kyalami' },
    mount_panorama: { zh: '帕诺拉马山赛道', en: 'Mount Panorama' },
    suzuka: { zh: '铃鹿赛道', en: 'Suzuka' },
    laguna_seca: { zh: '拉古纳塞卡赛道', en: 'Laguna Seca' },
    imola: { zh: '伊莫拉赛道', en: 'Imola' },
    oulton_park: { zh: '奥顿公园赛道', en: 'Oulton Park' },
    donington: { zh: '多宁顿赛道', en: 'Donington' },
    snetterton: { zh: '斯内特顿赛道', en: 'Snetterton' },
    cota: { zh: '美洲赛道', en: 'COTA' },
    indianapolis: { zh: '印第安纳波利斯赛道', en: 'Indianapolis' },
    watkins_glen: { zh: '沃特金斯格伦赛道', en: 'Watkins Glen' },
    valencia: { zh: '瓦伦西亚赛道', en: 'Valencia' },
    nurburgring_24h: { zh: '纽博格林北环赛道', en: 'Nürburgring 24h' },
    red_bull_ring: { zh: '红牛环赛道', en: 'Red Bull Ring' },
};

/** 将赛道 key 或英文名映射为中文显示名 */
export function trackDisplay(key: string | null | undefined): string {
    if (!key) return '—';
    const normalized = key.trim().toLowerCase().replace(/\s+/g, '_');
    if (TRACKS[normalized]) return TRACKS[normalized].zh;
    if (TRACKS[key]) return TRACKS[key].zh;
    return key;
}
