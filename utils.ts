/** 与单场成绩页一致：sessionType 代码 → 中文 */
export function sessionTypeLabelCn(sessionType: string): string {
  switch (sessionType) {
    case 'R':
      return '正赛';
    case 'Q':
      return '排位';
    case 'P':
      return '练习';
    default:
      return sessionType || '—';
  }
}
