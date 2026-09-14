/**
 * Due date display and picker.
 */

/**
 * WordPress dependencies
 */
import { Button, DatePicker, Dropdown } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import { formatDate, isOverdue, isYmd, toYmd } from '../../utils/format';

/**
 * @param {Object}   props            Props.
 * @param {string}   props.value      `Y-m-d` due date, or `''`.
 * @param {Function} props.onChange   Receives the new `Y-m-d` date (`''` clears).
 * @param {boolean}  props.canEdit    Whether the user may change it.
 * @param {boolean}  props.isSaving   Whether a workflow change is in flight.
 * @param {boolean}  props.isComplete Whether the workflow cycle is complete
 *                                    (a passed date is then not overdue).
 * @return {Element} Control.
 */
export default function DueDateControl( {
	value,
	onChange,
	canEdit,
	isSaving,
	isComplete,
} ) {
	const hasDate = isYmd( value );
	const overdue = hasDate && ! isComplete && isOverdue( value );

	let text = __( 'No due date', 'sit-cwm' );

	if ( hasDate ) {
		text = overdue
			? sprintf(
					/* translators: %s: Due date. */
					__( '%s (overdue)', 'sit-cwm' ),
					formatDate( value )
			  )
			: formatDate( value );
	}

	const valueClass = `sit-cwm-due-date-value${
		overdue ? ' is-overdue' : ''
	}`;

	return (
		<div className="sit-cwm-field sit-cwm-due-date">
			<span className="sit-cwm-field-label">
				{ __( 'Due date', 'sit-cwm' ) }
			</span>

			{ ! canEdit && <span className={ valueClass }>{ text }</span> }

			{ canEdit && (
				<div className="sit-cwm-due-date-row">
					<Dropdown
						popoverProps={ { placement: 'left-start' } }
						renderToggle={ ( { isOpen, onToggle } ) => (
							<Button
								className={ valueClass }
								variant="tertiary"
								onClick={ onToggle }
								aria-expanded={ isOpen }
								disabled={ isSaving }
								label={ sprintf(
									/* translators: %s: Current due date, or "No due date". */
									__( 'Change due date: %s', 'sit-cwm' ),
									text
								) }
								showTooltip={ false }
							>
								{ text }
							</Button>
						) }
						renderContent={ ( { onClose } ) => (
							<div className="sit-cwm-due-date-picker">
								<DatePicker
									currentDate={
										hasDate ? `${ value }T00:00:00` : null
									}
									onChange={ ( next ) => {
										const ymd = toYmd( next );

										onClose();

										if ( ymd && ymd !== value ) {
											onChange( ymd );
										}
									} }
								/>
							</div>
						) }
					/>
					{ hasDate && (
						<Button
							variant="link"
							isDestructive
							onClick={ () => onChange( '' ) }
							disabled={ isSaving }
						>
							{ __( 'Clear', 'sit-cwm' ) }
						</Button>
					) }
				</div>
			) }
		</div>
	);
}
