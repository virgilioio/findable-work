import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const PROSE_CLASSES =
  "prose prose-sm max-w-none text-text dark:prose-invert " +
  "leading-7 " +
  "prose-p:my-3 prose-p:leading-7 " +
  "prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-text " +
  "prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:marker:text-text-faint " +
  "prose-strong:text-text " +
  "prose-a:text-text prose-a:underline hover:prose-a:opacity-80 " +
  "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:text-text-mute " +
  "prose-hr:border-border " +
  "prose-code:text-text prose-code:bg-bg-bubble prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none " +
  "prose-pre:bg-bg-bubble prose-pre:text-text prose-pre:rounded-lg prose-pre:p-3";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn(PROSE_CLASSES, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || ""}</ReactMarkdown>
    </div>
  );
}