// The one mark a main brand carries: a small filled star. In the tree it sits
// on the folder's corner; on the kit page it sits before 「メインブランド」.
// Nothing else in the tree says main or sub — the kit page does that in
// words (docs/product.md §2.1).

export function MainMark({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-label="メインブランド" className={`${className} shrink-0 text-accent`}>
      <path
        d="M10 2.5l2.2 4.6 5.1.7-3.7 3.6.9 5.1L10 14.1l-4.5 2.4.9-5.1L2.7 7.8l5.1-.7L10 2.5z"
        fill="currentColor"
      />
    </svg>
  );
}
