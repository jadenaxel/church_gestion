type TrendCounts = { planned: number; completed: number; conflicts: number };
export function reportLabelFontSize(baseSize: number, width: number, measuredWidth: number): number {
  return Math.min(baseSize, baseSize * width / Math.max(measuredWidth, 1));
}
/** Preserve the established bar geometry; positive values receive a label above
 * their own bar, inside the chart's 24-point top allowance. */
export function reportTrendBars(item: TrendCounts, center: number, barWidth: number, chartY: number, chartH: number, maximum: number) {
  return ([['planned', -1.6], ['completed', -0.5], ['conflicts', 0.6]] as const).map(([key, offset]) => {
    const value = item[key];
    const height = value / maximum * (chartH - 24);
    const y = chartY + chartH - height;
    return { key, value, height, y, x: center + barWidth * offset, labelY: y - 9 };
  });
}
