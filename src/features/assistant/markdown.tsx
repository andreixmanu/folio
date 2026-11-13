import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

import { openExternalUrl } from './links';

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string };

export type MdBlock =
  | { type: 'paragraph'; inlines: MdInline[] }
  | { type: 'heading'; level: 1 | 2; inlines: MdInline[] }
  | { type: 'bullet'; items: MdInline[][] }
  | { type: 'numbered'; items: MdInline[][] };

const INLINE = /(`[^`]+`)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function parseInlines(input: string): MdInline[] {
  const inlines: MdInline[] = [];
  const pattern = new RegExp(INLINE.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (match.index > last) {
      inlines.push({ type: 'text', text: input.slice(last, match.index) });
    }
    if (match[1]) inlines.push({ type: 'code', text: match[1].slice(1, -1) });
    else if (match[2] && match[3]) inlines.push({ type: 'link', text: match[2], url: match[3] });
    else if (match[4]) inlines.push({ type: 'bold', text: match[4] });
    else if (match[5]) inlines.push({ type: 'italic', text: match[5] });
    last = match.index + match[0].length;
  }
  if (last < input.length) inlines.push({ type: 'text', text: input.slice(last) });
  return inlines.filter((inline) => inline.type !== 'text' || inline.text.length > 0);
}

/** Tiny markdown: paragraphs, bold, italic, code, lists, `#`/`##`, and links. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const inlines = parseInlines(paragraph.join('\n'));
    paragraph.length = 0;
    if (inlines.length > 0) blocks.push({ type: 'paragraph', inlines });
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading?.[1] && heading[2] !== undefined) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: heading[1].length === 1 ? 1 : 2,
        inlines: parseInlines(heading[2]),
      });
      index += 1;
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      const items: MdInline[][] = [];
      while (index < lines.length && /^[-*•]\s+/.test(lines[index] ?? '')) {
        items.push(parseInlines((lines[index] ?? '').replace(/^[-*•]\s+/, '')));
        index += 1;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: MdInline[][] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push(parseInlines((lines[index] ?? '').replace(/^\d+\.\s+/, '')));
        index += 1;
      }
      blocks.push({ type: 'numbered', items });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

function InlineRuns({ inlines }: { inlines: MdInline[] }) {
  const theme = useTheme();
  return (
    <>
      {inlines.map((inline, index) => {
        const key = `${inline.type}-${index}`;
        if (inline.type === 'bold') {
          return (
            <AppText key={key} variant="bodyStrong">
              {inline.text}
            </AppText>
          );
        }
        if (inline.type === 'italic') {
          return (
            <AppText key={key} style={{ fontStyle: 'italic' }}>
              {inline.text}
            </AppText>
          );
        }
        if (inline.type === 'code') {
          return (
            <AppText
              key={key}
              variant="caption"
              style={{
                fontFamily: 'monospace',
                backgroundColor: theme.colors.surfaceMuted,
              }}>
              {inline.text}
            </AppText>
          );
        }
        if (inline.type === 'link') {
          return (
            <AppText
              key={key}
              color="accent"
              accessibilityRole="link"
              onPress={() => openExternalUrl(inline.url)}>
              {inline.text}
            </AppText>
          );
        }
        return <AppText key={key}>{inline.text}</AppText>;
      })}
    </>
  );
}

function ListBlock({ ordered, items }: { ordered: boolean; items: MdInline[][] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <AppText variant="callout" color="textSecondary" style={{ minWidth: ordered ? 18 : 12 }}>
            {ordered ? `${index + 1}.` : '•'}
          </AppText>
          <AppText variant="callout" style={{ flex: 1 }}>
            <InlineRuns inlines={item} />
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function MarkdownView({ source }: { source: string }) {
  const theme = useTheme();
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {blocks.map((block, index) => {
        let body: ReactNode;
        if (block.type === 'heading') {
          body = (
            <AppText variant={block.level === 1 ? 'headline' : 'bodyStrong'}>
              <InlineRuns inlines={block.inlines} />
            </AppText>
          );
        } else if (block.type === 'bullet') {
          body = <ListBlock ordered={false} items={block.items} />;
        } else if (block.type === 'numbered') {
          body = <ListBlock ordered items={block.items} />;
        } else {
          body = (
            <AppText variant="callout">
              <InlineRuns inlines={block.inlines} />
            </AppText>
          );
        }
        return <View key={index}>{body}</View>;
      })}
    </View>
  );
}
