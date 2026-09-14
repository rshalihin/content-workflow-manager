/**
 * Coloured workflow status badge for dashboard rows.
 */

/**
 * Internal dependencies
 */
import { FALLBACK_STATUS_COLOR, getStatusDefinition } from '../utils/format';

/**
 * @param {Object} props         Props.
 * @param {string} props.status  Status slug.
 * @param {string} [props.label] Label from the REST row.
 * @return {Element} Badge.
 */
export default function StatusBadge( { status, label } ) {
	const definition = getStatusDefinition( status );
	const color = definition?.color || FALLBACK_STATUS_COLOR;

	return (
		<span className="sit-cwm-status-badge" data-status={ status }>
			<span
				className="sit-cwm-status-swatch"
				style={ { backgroundColor: color } }
				aria-hidden="true"
			/>
			<span className="sit-cwm-status-text">
				{ label || definition?.label || status }
			</span>
		</span>
	);
}
