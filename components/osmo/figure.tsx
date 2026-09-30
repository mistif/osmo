import styles from "./figure.module.css";

// Osmo himself: an organic heart with three dashed rings turning around it. The room and the lock
// screen both show him. He takes his colours, pulse and motion from CSS variables on an ancestor
// (--aura-a, --aura-b, --pulse, --strength, --voice, --open, --flow, --r1..3) and his state from its
// data-tone, data-listening and data-speaking attributes, so this component holds no logic.
type Props = {
	className?: string;
	// The subtitle under him: the sentence he's saying, or null for none.
	said?: string | null;
	// What he heard you say, shown above him while he listens and thinks; null for none.
	heard?: string | null;
};

const Ring = () => (
	<div className={styles.ring}>
		<svg viewBox="0 0 100 100" aria-hidden="true">
			<circle cx="50" cy="50" r="48" />
		</svg>
	</div>
);

export function Figure({ className = "", said = null, heard = null }: Props) {
	return (
		<div className={`${styles.figure} ${className}`}>
			{heard !== null && <p className={styles.heard}>{heard}</p>}
			<div className={styles.rings} aria-hidden="true">
				<Ring />
				<Ring />
				<Ring />
				<div className={styles.heart}>
					<i />
					<i />
					<i />
				</div>
			</div>
			{said !== null && (
				<p className={styles.said} aria-live="polite">
					{said}
				</p>
			)}
		</div>
	);
}
