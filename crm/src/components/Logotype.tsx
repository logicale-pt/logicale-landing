/** Logotipo LOGIC∧LE — o "A" é o Λ em cobre, o mesmo SVG da landing. */
export default function Logotype() {
  return (
    <span className="logotype">
      LOGIC
      <svg viewBox="0 0 20 24" aria-hidden="true">
        <path
          d="M2 22 L10 3 L18 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      LE
    </span>
  );
}
