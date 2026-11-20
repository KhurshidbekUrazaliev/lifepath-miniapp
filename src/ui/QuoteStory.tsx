// Sharing the day's words (the hero's hadith, the ayah of the day) as a Telegram story, with the companion
// as it looks now standing under them. The picture is lib/story.ts's drawQuoteStory; posting it is
// StoryButton's useStory, so the story leads to the bot the same way the others do.
import { CircleDashed, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { useEcho } from '../store/echo';
import { modelKey } from '../lib/companion';
import { itemById, wornOutfit } from '../lib/wardrobe';
import { drawQuoteStory, QuoteCard } from '../lib/story';
import { companionPicture } from '../companion/heroShot';
import { t } from '../i18n';
import { useStory } from './StoryButton';
import { Tap, cx } from './kit';

/** What a story of words says; the rest (the companion, its sky, the footer) the button adds. */
export type Quote = Pick<QuoteCard, 'label' | 'text' | 'arabic' | 'source'>;

/** How wide the companion is drawn for a story: the picture is 1080 wide, and it stands in most of it. */
const COMPANION_PX = 1000;

/** A small round button that posts `make()` as a story. Nothing shows where stories cannot be posted. */
export function QuoteStoryButton({ make, className }: { make: () => Quote; className?: string }) {
  const story = useStory();
  const e = useEcho();
  if (!story.can) return null;

  const share = () =>
    story.shareDrawn(async (link) => {
      const worn = wornOutfit(e.outfit, e.gender);
      const sky = itemById(worn.sky);
      const companion = e.echo ? await companionPicture(modelKey(e.gender, e.growth.index), COMPANION_PX) : null;
      return drawQuoteStory({
        ...make(),
        companion,
        sky: sky && sky.id !== 'bg-none' && sky.color ? [sky.color, sky.color2 ?? sky.color] : undefined,
        accent: e.accent,
        footer: t('story.footer'),
        link,
      });
    }, t('story.quote.caption'));

  return (
    <Tap
      className={cx('quote-story', story.failed && 'bad', className)}
      onTap={() => void share()}
      disabled={story.busy}
      label={story.failed ? t('story.failed') : t('story.share')}
      scale={0.9}
    >
      {story.busy ? (
        <SpinnerGap size={18} weight="bold" className="spin" />
      ) : story.failed ? (
        <WarningCircle size={18} weight="bold" />
      ) : (
        <CircleDashed size={18} weight="bold" />
      )}
    </Tap>
  );
}
