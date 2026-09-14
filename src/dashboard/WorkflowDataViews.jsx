/**
 * The workflow content table: DataViews over `GET /sit-cwm/v1/posts`.
 */

/**
 * WordPress dependencies
 */
import { Notice } from '@wordpress/components';
import { DataViews } from '@wordpress/dataviews';
import { useEffect, useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import buildActions from './actions';
import buildFields, { mergeUsers } from './fields';
import {
	DEFAULT_LAYOUTS,
	DEFAULT_VIEW,
	hasActiveQuery,
	viewFromSearchParams,
	viewToSearchParams,
} from './urlState';
import usePosts, { PER_PAGE_SIZES, viewToQuery } from '../hooks/usePosts';
import useUsers from '../hooks/useUsers';
import { getBootstrap } from '../utils/format';

/**
 * DataViews static configuration.
 *
 * @type {Object}
 */
const CONFIG = { perPageSizes: PER_PAGE_SIZES };

/**
 * Row id for DataViews.
 *
 * @param {Object} item Row.
 * @return {string} Post id.
 */
const getItemId = ( item ) => String( item.post_id );

/**
 * Whether the bootstrap says the user may list reviewers. A UI hint to skip a
 * request the server would refuse; the route checks for itself.
 *
 * @return {boolean} True when the reviewer list can be fetched.
 */
function canListReviewers() {
	const { capabilities = {} } = getBootstrap();

	return (
		!! capabilities.sit_cwm_assign_reviewer ||
		!! capabilities.sit_cwm_manage_workflows
	);
}

/**
 * Reviewers and authors seen in loaded rows, so filter options include them
 * even for users who cannot list reviewers.
 *
 * @param {Object[]} records Loaded rows.
 * @return {{reviewers: Object[], authors: Object[]}} Known users.
 */
function useKnownUsers( records ) {
	const [ known, setKnown ] = useState( { reviewers: [], authors: [] } );

	useEffect( () => {
		setKnown( ( previous ) => {
			const reviewers = mergeUsers(
				previous.reviewers,
				records.map( ( row ) => row.reviewer )
			);
			const authors = mergeUsers(
				previous.authors,
				records.map( ( row ) => row.author )
			);

			return reviewers.length === previous.reviewers.length &&
				authors.length === previous.authors.length
				? previous
				: { reviewers, authors };
		} );
	}, [ records ] );

	return known;
}

/**
 * Shown when nothing is in the workflow at all (no search or filter active).
 *
 * @return {Element} Empty state.
 */
function EmptyState() {
	const { adminUrl = '', postTypes } = getBootstrap();
	const type = Array.isArray( postTypes ) ? postTypes[ 0 ] : null;
	const href =
		type &&
		`${ adminUrl }post-new.php${
			type.slug === 'post'
				? ''
				: `?post_type=${ encodeURIComponent( type.slug ) }`
		}`;

	return (
		<div className="sit-cwm-dashboard-empty">
			<p>{ __( 'No content is in the workflow yet.', 'sit-cwm' ) }</p>
			{ href && (
				<a className="button button-primary" href={ href }>
					{ sprintf(
						/* translators: %s: Singular post type label, e.g. "Post". */
						__( 'Add new %s', 'sit-cwm' ),
						type.singularLabel
					) }
				</a>
			) }
		</div>
	);
}

/**
 * @return {Element} Dashboard table.
 */
export default function WorkflowDataViews() {
	const [ view, setView ] = useState( () =>
		viewFromSearchParams( window.location.search )
	);
	const query = useMemo( () => viewToQuery( view ), [ view ] );
	const { records, totalItems, totalPages, isLoading, error, refresh } =
		usePosts( query );
	const { users } = useUsers( {
		perPage: 100,
		enabled: canListReviewers(),
	} );
	const known = useKnownUsers( records );

	const fields = useMemo(
		() =>
			buildFields( {
				reviewers: mergeUsers( users, known.reviewers ),
				authors: mergeUsers( users, known.authors ),
			} ),
		[ users, known ]
	);
	const actions = useMemo(
		() => buildActions( { onChanged: refresh } ),
		[ refresh ]
	);

	// Reflect the view in the URL so a filtered dashboard is linkable.
	useEffect( () => {
		const params = viewToSearchParams( view, window.location.search );
		const search = params.toString();
		const next = `${ window.location.pathname }${ search ? `?${ search }` : '' }${ window.location.hash }`;
		const current = `${ window.location.pathname }${ window.location.search }${ window.location.hash }`;

		if ( next !== current ) {
			window.history.replaceState( window.history.state, '', next );
		}
	}, [ view ] );

	// A refetch can shrink the result set (e.g. the last row of the last page
	// was approved out of a status filter): step back to the last page.
	useEffect( () => {
		if ( ! isLoading && totalPages > 0 && view.page > totalPages ) {
			setView( ( current ) => ( { ...current, page: totalPages } ) );
		}
	}, [ isLoading, totalPages, view.page ] );

	const isDefaultView =
		viewToSearchParams( view ).toString() === '' &&
		view.type === DEFAULT_VIEW.type;

	return (
		<>
			{ error && (
				<Notice
					className="sit-cwm-dashboard-error"
					status="error"
					isDismissible={ false }
					actions={ [
						{ label: __( 'Retry', 'sit-cwm' ), onClick: refresh },
					] }
				>
					{ error.message }
				</Notice>
			) }
			<DataViews
				data={ records }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ { totalItems, totalPages } }
				defaultLayouts={ DEFAULT_LAYOUTS }
				getItemId={ getItemId }
				isLoading={ isLoading }
				config={ CONFIG }
				searchLabel={ __( 'Search content', 'sit-cwm' ) }
				empty={
					hasActiveQuery( view ) || error ? undefined : <EmptyState />
				}
				onReset={
					isDefaultView ? false : () => setView( DEFAULT_VIEW )
				}
			/>
		</>
	);
}
