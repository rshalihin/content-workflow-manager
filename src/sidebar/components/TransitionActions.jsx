/**
 * One button per transition the server offers the current user.
 *
 * The list comes from `available_transitions`; this component never works out
 * which moves are allowed.
 */

/**
 * WordPress dependencies
 */
import { Button, Modal } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import { getStatusDefinition } from '../../utils/format';

/**
 * Whether a transition asks for confirmation: rollbacks, and moves into a
 * final status (Published).
 *
 * @param {Object} transition `{ slug, label, is_forward, is_rollback }`.
 * @return {boolean} True when a confirm dialog is shown first.
 */
export function requiresConfirmation( transition ) {
	return (
		!! transition.is_rollback ||
		!! getStatusDefinition( transition.slug )?.is_final
	);
}

/**
 * @param {Object}   props              Props.
 * @param {Object[]} props.transitions  Available transitions.
 * @param {Function} props.onTransition Receives the target status slug.
 * @param {boolean}  props.isSaving     Whether a workflow change is in flight.
 * @return {Element} Actions.
 */
export default function TransitionActions( {
	transitions,
	onTransition,
	isSaving,
} ) {
	const [ pending, setPending ] = useState( null );
	const [ activeSlug, setActiveSlug ] = useState( null );

	if ( ! Array.isArray( transitions ) || transitions.length === 0 ) {
		return (
			<p className="sit-cwm-help">
				{ __(
					'No workflow actions are available to you right now.',
					'sit-cwm'
				) }
			</p>
		);
	}

	const run = async ( transition ) => {
		setActiveSlug( transition.slug );

		try {
			await onTransition( transition.slug );
		} finally {
			setActiveSlug( null );
		}
	};

	const actionLabel = ( transition ) =>
		sprintf(
			/* translators: %s: Target workflow status label. */
			__( 'Move to %s', 'sit-cwm' ),
			transition.label
		);

	return (
		<>
			<div
				className="sit-cwm-actions"
				role="group"
				aria-label={ __( 'Workflow actions', 'sit-cwm' ) }
			>
				{ transitions.map( ( transition ) => (
					<Button
						key={ transition.slug }
						variant={
							transition.is_rollback ? 'secondary' : 'primary'
						}
						isDestructive={ !! transition.is_rollback }
						isBusy={ activeSlug === transition.slug }
						disabled={ isSaving }
						onClick={ () =>
							requiresConfirmation( transition )
								? setPending( transition )
								: run( transition )
						}
					>
						{ actionLabel( transition ) }
					</Button>
				) ) }
			</div>

			{ pending && (
				<Modal
					className="sit-cwm-confirm"
					title={ sprintf(
						/* translators: %s: Target workflow status label. */
						__( 'Move to %s?', 'sit-cwm' ),
						pending.label
					) }
					onRequestClose={ () => setPending( null ) }
				>
					<p>
						{ pending.is_rollback
							? __(
									'This sends the content back to an earlier workflow stage.',
									'sit-cwm'
							  )
							: __(
									'This completes the workflow cycle for this content.',
									'sit-cwm'
							  ) }
					</p>
					<div className="sit-cwm-confirm-actions">
						<Button
							variant="tertiary"
							onClick={ () => setPending( null ) }
						>
							{ __( 'Cancel', 'sit-cwm' ) }
						</Button>
						<Button
							variant="primary"
							isDestructive={ !! pending.is_rollback }
							onClick={ () => {
								const transition = pending;

								setPending( null );
								run( transition );
							} }
						>
							{ actionLabel( pending ) }
						</Button>
					</div>
				</Modal>
			) }
		</>
	);
}
