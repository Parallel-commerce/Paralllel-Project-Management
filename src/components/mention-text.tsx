import {
  tokenizeMentions,
  type MentionPerson,
} from "@/lib/mentions";

export function MentionText({
  body,
  people,
  className = "whitespace-pre-wrap break-words text-sm",
  mentionClassName = "font-medium text-[var(--accent)]",
}: {
  body: string;
  people: MentionPerson[];
  className?: string;
  mentionClassName?: string;
}) {
  const tokens = tokenizeMentions(body, people);

  return (
    <p className={className}>
      {tokens.map((token, index) =>
        token.type === "mention" ? (
          <span key={index} className={mentionClassName}>
            {token.value}
          </span>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </p>
  );
}
