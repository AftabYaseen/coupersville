// The illustrated Main Street from the brand package, used in the home page hero. Decorative only.
// The package's floating sample tickets ("2 for 1, Today only", "Saved!") are left out so the
// picture makes no offer claims; one blank ticket with a % keeps the coupon idea. The town sign
// carries the wording of the real Coupersville sign.
export function MainStreetArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 450" className={className} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="awn-a" width="28" height="10" patternUnits="userSpaceOnUse">
          <rect width="14" height="10" fill="#F2B33D" />
          <rect x="14" width="14" height="10" fill="#FFF8EC" />
        </pattern>
        <pattern id="awn-b" width="28" height="10" patternUnits="userSpaceOnUse">
          <rect width="14" height="10" fill="#B93A1F" />
          <rect x="14" width="14" height="10" fill="#FFF8EC" />
        </pattern>
        <pattern id="awn-c" width="28" height="10" patternUnits="userSpaceOnUse">
          <rect width="14" height="10" fill="#3C7A63" />
          <rect x="14" width="14" height="10" fill="#FFF8EC" />
        </pattern>
      </defs>
      <circle cx="290" cy="215" r="205" fill="#FDF1D6" />
      <circle cx="458" cy="190" r="26" fill="#F2B33D" opacity=".9" />
      <rect x="20" y="368" width="520" height="14" rx="7" fill="#E7DFCF" />
      {/* Shop 1 */}
      <path d="M88 170h126v198H88z" fill="#E4F1EA" />
      <path d="M80 150h142l-8 20H88z" fill="#1F4D3F" />
      <rect x="104" y="190" width="36" height="40" rx="18" fill="#FFF8EC" />
      <rect x="162" y="190" width="36" height="40" rx="18" fill="#FFF8EC" />
      <path d="M84 252h134v26c0 6-5 10-11 10H95c-6 0-11-4-11-10z" fill="url(#awn-a)" />
      <path d="M84 252h134" stroke="#14231E" strokeWidth="3" strokeLinecap="round" />
      <rect x="102" y="300" width="50" height="68" rx="4" fill="#FFFFFF" />
      <rect x="164" y="300" width="36" height="68" rx="18" fill="#1F4D3F" />
      {/* Shop 2, gabled like the logo mark */}
      <path d="M232 112h130v256H232z" fill="#FFFFFF" />
      <path d="M226 116l71-50 71 50z" fill="#1F4D3F" />
      <circle cx="297" cy="98" r="9" fill="#F2B33D" />
      <rect x="250" y="138" width="30" height="36" rx="4" fill="#E3EEF7" />
      <rect x="314" y="138" width="30" height="36" rx="4" fill="#E3EEF7" />
      <rect x="250" y="192" width="30" height="36" rx="4" fill="#E3EEF7" />
      <rect x="314" y="192" width="30" height="36" rx="4" fill="#E3EEF7" />
      <path d="M226 250h142v26c0 6-5 10-11 10H237c-6 0-11-4-11-10z" fill="url(#awn-b)" />
      <path d="M226 250h142" stroke="#14231E" strokeWidth="3" strokeLinecap="round" />
      <rect x="248" y="300" width="44" height="68" rx="4" fill="#E4F1EA" />
      <path d="M304 368v-46a17 17 0 0 1 34 0v46z" fill="#F2B33D" />
      {/* Shop 3 */}
      <path d="M380 216h110v152H380z" fill="#EEE8F6" />
      <path d="M374 198h122l-6 18H380z" fill="#14231E" />
      <path d="M376 252h118v24c0 6-5 10-11 10h-96c-6 0-11-4-11-10z" fill="url(#awn-c)" />
      <path d="M376 252h118" stroke="#14231E" strokeWidth="3" strokeLinecap="round" />
      <rect x="398" y="226" width="74" height="18" rx="4" fill="#FFF8EC" />
      <rect x="394" y="300" width="36" height="68" rx="4" fill="#1F4D3F" />
      <rect x="442" y="300" width="34" height="48" rx="4" fill="#FFFFFF" />
      {/* Tree */}
      <rect x="511" y="318" width="6" height="50" rx="3" fill="#1F4D3F" />
      <circle cx="514" cy="306" r="24" fill="#3C7A63" />
      {/* Town sign */}
      <g transform="translate(30 290) rotate(-4)">
        <rect x="36" y="78" width="8" height="58" rx="3" fill="#14231E" />
        <rect x="132" y="78" width="8" height="58" rx="3" fill="#14231E" />
        <rect x="0" y="0" width="176" height="90" rx="12" fill="#1F4D3F" stroke="#FFF8EC" strokeWidth="4" />
        <text x="88" y="25" textAnchor="middle" fontSize="12" fontWeight="700" fill="#F2B33D" style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}>
          Welcome to
        </text>
        <text x="88" y="52" textAnchor="middle" fontSize="24" fontWeight="600" fill="#FFF8EC" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
          Coupersville
        </text>
        <text x="88" y="73" textAnchor="middle" fontSize="10" fontWeight="500" fill="#E4F1EA" style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}>
          Population: growing every day
        </text>
      </g>
      {/* A blank coupon ticket */}
      <g transform="translate(372 52) rotate(8)">
        <path
          d="M0 14A14 14 0 0 1 14 0h120a14 14 0 0 1 14 14v18a10 10 0 0 0 0 20v18a14 14 0 0 1-14 14H14A14 14 0 0 1 0 70V52a10 10 0 0 0 0-20Z"
          fill="#FFFFFF"
        />
        <path d="M42 12v60" stroke="#E7DFCF" strokeWidth="2.5" strokeDasharray="4 5" />
        <text x="21" y="49" textAnchor="middle" fontSize="20" fontWeight="700" fill="#8A5A00" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
          %
        </text>
        <rect x="56" y="28" width="68" height="10" rx="5" fill="#FDF1D6" />
        <rect x="56" y="46" width="48" height="8" rx="4" fill="#E7DFCF" />
      </g>
    </svg>
  );
}
