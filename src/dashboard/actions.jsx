/**
 * Per-row DataViews actions.
 *
 * Every `isEligible` predicate is a UX filter only: it hides actions the row's
 * server-computed `available_transitions` and `capabilities` rule out. Each
 * request is authorized again by the REST API and WorkflowManager, so a stale
 * or tampered row can never do more than the server allows.
 */

/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { pencil } from '@wordpress/icons';

/**
 * Internal dependencies
 */
import DueDateModal from './modals/DueDateModal';
import ReviewerModal from './modals/ReviewerModal';
import TransitionModal from './modals/TransitionModal';
import { isSafeUrl } from '../utils/format';

/**
 * Whether the server offered a transition to a status for a row.
 *
 * @param {Object} item Row.
 * @param {string} slug Target status slug.
 * @return {boolean} True when offered.
 */
export function canMoveTo( item, slug ) {
	return (
		Array.isArray( item?.available_transitions ) &&
		item.available_transitions.some(
			( transition ) => transition && transition.slug === slug
		)
	);
}

/**
 * Builds the row actions.
 *
 * @param {Object}   options           Options.
 * @param {Function} options.onChanged Refetches the current page after a change.
 * @return {Object[]} DataViews actions.
 */
export default function buildActions( { onChanged } ) {
	function ApproveModal( props ) {
		return (
			<TransitionModal
				{ ...props }
				to="approved"
				submitLabel={ __( 'Approve', 'sit-cwm' ) }
				onChanged={ onChanged }
			/>
		);
	}

	function RequestChangesModal( props ) {
		return (
			<TransitionModal
				{ ...props }
				to="needs_changes"
				submitLabel={ __( 'Request changes', 'sit-cwm' ) }
				withComment
				onChanged={ onChanged }
			/>
		);
	}

	function AssignReviewerModal( props ) {
		return <ReviewerModal { ...props } onChanged={ onChanged } />;
	}

	function SetDueDateModal( props ) {
		return <DueDateModal { ...props } onChanged={ onChanged } />;
	}

	return [
		{
			id: 'edit',
			label: __( 'Edit', 'sit-cwm' ),
			icon: pencil,
			isPrimary: true,
			isEligible: ( item ) => isSafeUrl( item.edit_link ),
			callback: ( [ item ] ) => {
				if ( item && isSafeUrl( item.edit_link ) ) {
					window.location.assign( item.edit_link );
				}
			},
		},
		{
			id: 'approve',
			label: __( 'Approve', 'sit-cwm' ),
			modalHeader: __( 'Approve content', 'sit-cwm' ),
			isEligible: ( item ) => canMoveTo( item, 'approved' ),
			RenderModal: ApproveModal,
		},
		{
			id: 'request-changes',
			label: __( 'Request changes', 'sit-cwm' ),
			modalHeader: __( 'Request changes', 'sit-cwm' ),
			isEligible: ( item ) => canMoveTo( item, 'needs_changes' ),
			RenderModal: RequestChangesModal,
		},
		{
			id: 'assign-reviewer',
			label: __( 'Assign reviewer', 'sit-cwm' ),
			modalHeader: __( 'Assign reviewer', 'sit-cwm' ),
			isEligible: ( item ) => !! item.capabilities?.can_assign_reviewer,
			RenderModal: AssignReviewerModal,
		},
		{
			id: 'set-due-date',
			label: __( 'Set due date', 'sit-cwm' ),
			modalHeader: __( 'Set due date', 'sit-cwm' ),
			modalSize: 'small',
			isEligible: ( item ) => !! item.capabilities?.can_set_due_date,
			RenderModal: SetDueDateModal,
		},
	];
}
