export interface VsCodeLogoProps {
  className?: string;
  /** Rendered as an accessible image when a title is provided. */
  title?: string;
}

/**
 * Visual Studio Code mark.
 *
 * Uses the official blue rather than `currentColor`: the editor is a recognisable
 * third-party brand in this list, and rendering it monochrome would make the card
 * harder to pick out among the other integrations.
 */
export function VsCodeLogo({ className, title }: VsCodeLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M75.9 99.3a6.2 6.2 0 0 0 4.96-.19l14.9-7.17A6.25 6.25 0 0 0 99.3 86.3V13.7a6.25 6.25 0 0 0-3.54-5.63L80.86.9a6.25 6.25 0 0 0-7.13 1.2L45.2 28.13 32.77 18.7a4.17 4.17 0 0 0-5.33.24l-3.99 3.63a4.17 4.17 0 0 0-.004 6.16L34.23 50 23.45 61.27a4.17 4.17 0 0 0 .004 6.16l3.99 3.63a4.17 4.17 0 0 0 5.33.24L45.2 71.87l28.53 26.03c.62.57 1.37.98 2.17 1.2ZM74.98 27.3 53.33 50l21.65 22.7V27.3Z"
        fill="#0065A9"
      />
      <path
        d="M75.9 99.3a6.2 6.2 0 0 0 4.96-.19l14.9-7.17A6.25 6.25 0 0 0 99.3 86.3V13.7a6.25 6.25 0 0 0-3.54-5.63L80.86.9a6.25 6.25 0 0 0-7.13 1.2L45.2 28.13 32.77 18.7a4.17 4.17 0 0 0-5.33.24l-3.99 3.63a4.17 4.17 0 0 0-.004 6.16L34.23 50 23.45 61.27a4.17 4.17 0 0 0 .004 6.16l3.99 3.63a4.17 4.17 0 0 0 5.33.24L45.2 71.87l28.53 26.03c.62.57 1.37.98 2.17 1.2ZM74.98 27.3 53.33 50l21.65 22.7V27.3Z"
        fill="url(#optsolv-vscode-blue)"
        fillOpacity="0.9"
      />
      <defs>
        <linearGradient
          id="optsolv-vscode-blue"
          x1="50"
          y1="0"
          x2="50"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0065A9" />
          <stop offset="1" stopColor="#007ACC" />
        </linearGradient>
      </defs>
    </svg>
  );
}
