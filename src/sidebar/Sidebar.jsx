/**
 * The "Content Workflow" editor sidebar.
 */

/**
 * WordPress dependencies
 */
import { Button, Notice, PanelBody, Spinner } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import {
	PluginSidebar as EditPostPluginSidebar,
	PluginSidebarMoreMenuItem as EditPostPluginSidebarMoreMenuItem,
} from '@wordpress/edit-post';
import {
	PluginSidebar as EditorPluginSidebar,
	PluginSidebarMoreMenuItem as EditorPluginSidebarMoreMenuItem,
	store as editorStore,
} from '@wordpress/editor';
import { __ } from '@wordpress/i18n';
import { seen } from '@wordpress/icons';

/**
 * Internal dependencies
 */
import ActivityTimeline from '../components/ActivityTimeline';
import useWorkflow from '../hooks/useWorkflow';
import { getStatusDefinition, isEnabledPostType } from '../utils/format';
import CommentForm from './components/CommentForm';
import DueDateControl from './components/DueDateControl';
import ReviewerControl from './components/ReviewerControl';
import StatusControl from './components/StatusControl';
import TransitionActions from './components/TransitionActions';

/**
 * Plugin name passed to `registerPlugin()`.
 *
 * @type {string}
 */
export const PLUGIN_NAME = 'sit-cwm-sidebar';

/**
 * Sidebar name within the plugin.
 *
 * @type {string}
 */
const SIDEBAR_NAME = 'workflow';

// WordPress 6.6 moved the sidebar slots to `@wordpress/editor`; the
// `@wordpress/edit-post` exports are only read on older versions, which avoids
// their deprecation notice where the new ones exist.
const PluginSidebar = EditorPluginSidebar || EditPostPluginSidebar;
const PluginSidebarMoreMenuItem =
	EditorPluginSidebarMoreMenuItem || EditPostPluginSidebarMoreMenuItem;

/**
 * Shown when the post has no workflow.
 *
 * @return {Element} Notice.
 */
function Unavailable() {
	return (
		<PanelBody>
			<Notice status="info" isDismissible={ false }>
				{ __(
					'Workflow not available for this post type.',
					'sit-cwm'
				) }
			</Notice>
		</PanelBody>
	);
}

/**
 * Workflow controls for one post. Mounted only while the sidebar is open.
 *
 * @param {Object} props        Props.
 * @param {number} props.postId Post id.
 * @return {Element} Panel.
 */
function WorkflowPanel( { postId } ) {
	const {
		workflow,
		isLoading,
		isSaving,
		error,
		activityVersion,
		updateStatus,
		assignReviewer,
		setDueDate,
		addComment,
		refresh,
		clearError,
	} = useWorkflow( postId );

	if ( ! workflow && isLoading ) {
		return (
			<div className="sit-cwm-sidebar-loading">
				<Spinner />
			</div>
		);
	}

	if ( ! workflow ) {
		if ( ! error || error.status === 404 ) {
			return <Unavailable />;
		}

		return (
			<PanelBody>
				<Notice status="error" isDismissible={ false }>
					{ error.message }
				</Notice>
				<Button variant="secondary" onClick={ refresh }>
					{ __( 'Retry', 'sit-cwm' ) }
				</Button>
			</PanelBody>
		);
	}

	const capabilities = workflow.capabilities || {};
	const definition = getStatusDefinition( workflow.status );

	return (
		<div className="sit-cwm-sidebar">
			{ error && (
				<Notice
					className="sit-cwm-sidebar-notice"
					status="error"
					isDismissible
					onRemove={ clearError }
				>
					{ error.message }
				</Notice>
			) }

			<PanelBody>
				<StatusControl
					status={ workflow.status }
					label={ workflow.status_label }
				/>

				{ capabilities.can_assign_reviewer && (
					<ReviewerControl
						postId={ postId }
						reviewer={ workflow.reviewer }
						onChange={ assignReviewer }
						isSaving={ isSaving }
					/>
				) }

				<DueDateControl
					value={ workflow.due_date }
					onChange={ setDueDate }
					canEdit={ !! capabilities.can_set_due_date }
					isSaving={ isSaving }
					isComplete={ !! definition?.is_final }
				/>
			</PanelBody>

			<PanelBody title={ __( 'Workflow actions', 'sit-cwm' ) }>
				<TransitionActions
					transitions={ workflow.available_transitions }
					onTransition={ updateStatus }
					isSaving={ isSaving }
				/>
			</PanelBody>

			{ capabilities.can_comment && (
				<PanelBody title={ __( 'Comment', 'sit-cwm' ) }>
					<CommentForm
						onSubmit={ addComment }
						isSaving={ isSaving }
					/>
				</PanelBody>
			) }

			{ /* Not mounted at all without the capability, so no request is made. */ }
			{ capabilities.can_view_activity && (
				<PanelBody title={ __( 'Activity', 'sit-cwm' ) }>
					<ActivityTimeline
						postId={ postId }
						version={ activityVersion }
					/>
				</PanelBody>
			) }
		</div>
	);
}

/**
 * Sidebar and its "more menu" entry.
 *
 * @return {Element} Plugin output.
 */
export default function Sidebar() {
	const { postId, postType } = useSelect( ( select ) => {
		const editor = select( editorStore );

		return {
			postId: editor.getCurrentPostId(),
			postType: editor.getCurrentPostType(),
		};
	}, [] );

	const title = __( 'Content Workflow', 'sit-cwm' );

	return (
		<>
			<PluginSidebarMoreMenuItem target={ SIDEBAR_NAME } icon={ seen }>
				{ title }
			</PluginSidebarMoreMenuItem>
			<PluginSidebar name={ SIDEBAR_NAME } title={ title } icon={ seen }>
				{ postId && isEnabledPostType( postType ) ? (
					<WorkflowPanel key={ postId } postId={ postId } />
				) : (
					<Unavailable />
				) }
			</PluginSidebar>
		</>
	);
}
