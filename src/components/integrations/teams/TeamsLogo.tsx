/**
 * Official Microsoft Teams mark.
 *
 * Hand-authored from Microsoft's brand geometry rather than a raster trace:
 * a traced PNG carries an opaque background plate and thousands of path
 * points, which renders a grey box behind the logo and bloats the bundle.
 *
 * The gradient id is namespaced so multiple instances on the same page cannot
 * collide in the SVG id space.
 */

export interface TeamsLogoProps {
  className?: string;
  /** Rendered as an accessible image when a title is provided. */
  title?: string;
}

export function TeamsLogo({ className, title }: TeamsLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 2228.833 2073.333"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#5059C9"
        d="M1554.637 777.5h575.713c54.391 0 98.483 44.092 98.483 98.483v524.398c0 199.901-162.051 361.952-361.952 361.952h-1.711c-199.901.028-361.975-162-362.004-361.901V828.971c0-28.427 23.044-51.471 51.471-51.471z"
      />
      <circle fill="#5059C9" cx="1943.75" cy="440.583" r="233.25" />
      <circle fill="#7B83EB" cx="1218.083" cy="336.917" r="336.917" />
      <path
        fill="#7B83EB"
        d="M1667.323 777.5H717.01c-53.743 1.33-96.257 45.931-95.01 99.676v598.105c-7.505 322.519 247.657 590.16 570.167 598.053 322.51-7.893 577.671-275.534 570.167-598.053V877.176c1.247-53.745-41.266-98.346-95.011-99.676z"
      />
      <path
        opacity=".1"
        d="M1244 777.5v838.145c-.258 38.435-23.549 72.964-59.09 87.598a94.81 94.81 0 0 1-35.765 7.257H667.613a516.02 516.02 0 0 1-18.142-51.833c-18.144-59.477-27.402-121.307-27.472-183.49V877.02c-1.246-53.659 41.198-98.19 94.855-99.52H1244z"
      />
      <path
        opacity=".2"
        d="M1192.167 777.5v889.978a94.81 94.81 0 0 1-7.257 35.765c-14.634 35.541-49.163 58.833-87.598 59.09H691.975a423.4 423.4 0 0 1-24.362-51.833 613.4 613.4 0 0 1-18.142-51.833c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659 41.198-98.19 94.855-99.52h475.313z"
      />
      <path
        opacity=".2"
        d="M1192.167 777.5v786.312c-.395 52.223-42.632 94.46-94.855 94.855h-447.84c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659 41.198-98.19 94.855-99.52h475.312z"
      />
      <path
        opacity=".2"
        d="M1140.333 777.5v786.312c-.395 52.223-42.632 94.46-94.855 94.855H649.472c-18.144-59.476-27.402-121.307-27.472-183.49V877.02c-1.246-53.659 41.198-98.19 94.855-99.52h423.478z"
      />
      <path
        opacity=".1"
        d="M1244 509.522v163.275a423.4 423.4 0 0 1-25.917 1.037c-8.812 0-17.105-.518-25.917-1.037a444.5 444.5 0 0 1-51.833-8.293c-104.963-24.857-191.679-98.469-233.25-198.003a423.4 423.4 0 0 1-16.587-51.833h258.648c52.612.169 94.687 42.244 94.856 94.854z"
      />
      <path
        opacity=".2"
        d="M1192.167 561.355v111.442a444.5 444.5 0 0 1-51.833-8.293c-104.963-24.857-191.679-98.469-233.25-198.003h190.228c52.612.169 94.686 42.243 94.855 94.854z"
      />
      <linearGradient
        id="teams-logo-gradient"
        gradientUnits="userSpaceOnUse"
        x1="198.099"
        y1="1683.0726"
        x2="942.2344"
        y2="394.2607"
        gradientTransform="matrix(1 0 0 -1 0 2075.3333)"
      >
        <stop offset="0" stopColor="#5a62c3" />
        <stop offset=".5" stopColor="#4d55bd" />
        <stop offset="1" stopColor="#3940ab" />
      </linearGradient>
      <path
        fill="url(#teams-logo-gradient)"
        d="M95.01 466.5h950.312c52.473 0 95.01 42.538 95.01 95.01v950.312c0 52.473-42.538 95.01-95.01 95.01H95.01c-52.473 0-95.01-42.538-95.01-95.01V561.51c0-52.472 42.538-95.01 95.01-95.01z"
      />
      <path
        fill="#FFF"
        d="M820.211 828.193H630.241v517.297H509.211V828.193H320.123V727.844h500.088v100.349z"
      />
    </svg>
  );
}
