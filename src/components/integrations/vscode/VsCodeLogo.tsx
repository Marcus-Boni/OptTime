export interface VsCodeLogoProps {
  className?: string;
  /** Rendered as an accessible image when a title is provided. */
  title?: string;
}

/**
 * Visual Studio Code mark.
 *
 * Official single-path outline. The trailing subpath is the notch between the
 * two folds and is meant to be hollow — it winds against the outer contour, so
 * the default `nonzero` fill rule cuts it out. Redrawing this shape by hand
 * tends to fill that gap in, which reads as a solid blob at 20px.
 *
 * Painted in the VS Code blue rather than `currentColor`: like the Azure DevOps
 * mark beside it, this is a third-party brand the reader scans for by colour.
 */
export function VsCodeLogo({ className, title }: VsCodeLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"
        fill="#0098FF"
      />
    </svg>
  );
}
