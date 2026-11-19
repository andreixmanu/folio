import { headerWashHeight, heroWashHeight, heroWashSpan, type HeroWash } from '@/components/ui/hero-glow';
import { spacing, typography } from '@/theme';

/**
 * The painted wash is taller than the hero so the accent can dissolve on the
 * hero's bottom edge. 0.72 is `WASH_CLEAR_AT` in `hero-glow.tsx`.
 */
const CLEAR_AT = 0.72;

describe('hero wash', () => {
  const kinds: HeroWash[] = ['title', 'summary', 'chart'];

  test.each(kinds)('%s clears as the next section starts', (kind) => {
    const topPad = 47;
    const heroBottom = topPad + heroWashSpan(kind);
    const height = heroWashHeight(topPad, kind);
    expect(height).toBeGreaterThan(heroBottom);
    expect(heroBottom / height).toBeCloseTo(CLEAR_AT, 5);
    // Still a hero, not a full-screen wash.
    expect(height).toBeLessThan(900);
  });

  test('chart covers more than the title, summary sits between them', () => {
    expect(heroWashSpan('title')).toBeLessThan(heroWashSpan('summary'));
    expect(heroWashSpan('summary')).toBeLessThan(heroWashSpan('chart'));
  });

  test('assistant wash is clear where the thread starts', () => {
    const insetTop = 47;
    const header = spacing.xs + (typography.largeTitle.lineHeight ?? 34) + spacing.xs;
    const threadTop = insetTop + spacing.xs + header + spacing.sm;
    const height = headerWashHeight(insetTop);
    expect(threadTop / height).toBeCloseTo(CLEAR_AT, 5);
    expect(height).toBeLessThan(280);
  });
});
