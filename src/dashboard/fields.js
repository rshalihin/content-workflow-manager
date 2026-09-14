/**
 * DataViews field definitions for the dashboard.
 *
 * Status and post type options come from the `window.sitCwm` bootstrap;
 * reviewer and author options are passed in from `/users` and the loaded rows.
 * Only `title` and `due_date` sort, and filters only offer operators
 * `viewToQuery()` maps to the REST API.
 */

/**
 * WordPress dependencies
 */
import { dateI18n, getSettings, humanTimeDiff } from '@wordpress/date';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import StatusBadge from './StatusBadge';
import { FILTER_OPERATORS } from '../hooks/usePosts';
import { formatDate, getBootstrap, isSafeUrl } from '../utils/format';

/**
 * A dash for an empty cell, with a spoken label.
 *
 * @param {Object} props       Props.
 * @param {string} props.label Screen reader text.
 * @return {Element} Placeholder.
 */
function EmptyValue( { label } ) {
	return (
		<span className="sit-cwm-empty-value">
			<span aria-hidden="true">—</span>
			<span className="screen-reader-text">{ label }</span>
		</span>
	);
}

/**
 * Merges user summaries, keeping the first occurrence of each id.
 *
 * @param {...Array} lists Lists of `{ id, name }` (null entries are skipped).
 * @return {Object[]} Unique users.
 */
export function mergeUsers( ...lists ) {
	const seen = new Map();

	lists.flat().forEach( ( user ) => {
		if (
			user &&
			Number.isInteger( user.id ) &&
			user.id > 0 &&
			! seen.has( user.id )
		) {
			seen.set( user.id, user );
		}
	} );

	return [ ...seen.values() ];
}

/**
 * Filter elements for users, sorted by name.
 *
 * @param {Object[]} users User summaries.
 * @return {Object[]} `{ value, label }` elements.
 */
function userElements( users ) {
	return mergeUsers( users )
		.map( ( user ) => ( { value: user.id, label: user.name || '' } ) )
		.sort( ( a, b ) => a.label.localeCompare( b.label ) );
}

function TitleCell( { item } ) {
	const title = item.title || __( '(no title)', 'sit-cwm' );

	return isSafeUrl( item.edit_link ) ? (
		<a className="sit-cwm-title-link" href={ item.edit_link }>
			{ title }
		</a>
	) : (
		<span>{ title }</span>
	);
}

function StatusCell( { item } ) {
	return <StatusBadge status={ item.status } label={ item.status_label } />;
}

function ReviewerCell( { item } ) {
	const { reviewer } = item;

	if ( ! reviewer ) {
		return <EmptyValue label={ __( 'Unassigned', 'sit-cwm' ) } />;
	}

	return (
		<span className="sit-cwm-user">
			{ isSafeUrl( reviewer.avatar ) && (
				<img
					className="sit-cwm-avatar"
					src={ reviewer.avatar }
					alt=""
					width={ 24 }
					height={ 24 }
				/>
			) }
			<span>{ reviewer.name }</span>
		</span>
	);
}

function DueDateCell( { item } ) {
	const text = formatDate( item.due_date );

	if ( ! text ) {
		return <EmptyValue label={ __( 'No due date', 'sit-cwm' ) } />;
	}

	// `is_overdue` is computed by the server in the site timezone.
	if ( ! item.is_overdue ) {
		return <span>{ text }</span>;
	}

	return (
		<span className="sit-cwm-due-date is-overdue">
			{ sprintf(
				/* translators: %s: Due date. */
				__( '%s (overdue)', 'sit-cwm' ),
				text
			) }
		</span>
	);
}

function AuthorCell( { item } ) {
	return item.author?.name ? (
		<span>{ item.author.name }</span>
	) : (
		<EmptyValue label={ __( 'Unknown author', 'sit-cwm' ) } />
	);
}

function PostTypeCell( { item } ) {
	const { postTypes } = getBootstrap();
	const type = Array.isArray( postTypes )
		? postTypes.find( ( entry ) => entry && entry.slug === item.post_type )
		: null;

	return <span>{ type?.singularLabel || item.post_type }</span>;
}

function LastActivityCell( { item } ) {
	const entry = item.last_activity;

	if ( ! entry || ! entry.created_at ) {
		return <EmptyValue label={ __( 'No activity', 'sit-cwm' ) } />;
	}

	const { formats } = getSettings();

	return (
		<span className="sit-cwm-last-activity">
			<span className="sit-cwm-last-activity-action">
				{ entry.action_label }
			</span>
			<time
				dateTime={ entry.created_at }
				title={ dateI18n(
					`${ formats.date } ${ formats.time }`,
					entry.created_at
				) }
			>
				{ humanTimeDiff( entry.created_at ) }
			</time>
		</span>
	);
}

/**
 * Builds the dashboard fields.
 *
 * @param {Object}   [options]           Options.
 * @param {Object[]} [options.reviewers] Known reviewers `{ id, name }`.
 * @param {Object[]} [options.authors]   Known authors `{ id, name }`.
 * @return {Object[]} DataViews fields.
 */
export default function buildFields( { reviewers = [], authors = [] } = {} ) {
	const { statuses, postTypes } = getBootstrap();
	const authorElements = userElements( authors );

	return [
		{
			id: 'title',
			type: 'text',
			label: __( 'Title', 'sit-cwm' ),
			getValue: ( { item } ) => item.title || '',
			render: TitleCell,
			enableSorting: true,
			enableGlobalSearch: true,
			enableHiding: false,
			filterBy: false,
		},
		{
			id: 'status',
			type: 'text',
			label: __( 'Status', 'sit-cwm' ),
			getValue: ( { item } ) => item.status,
			render: StatusCell,
			elements: ( Array.isArray( statuses ) ? statuses : [] )
				.filter( Boolean )
				.map( ( status ) => ( {
					value: status.slug,
					label: status.label,
				} ) ),
			enableSorting: false,
			filterBy: { operators: FILTER_OPERATORS.status, isPrimary: true },
		},
		{
			id: 'reviewer',
			type: 'integer',
			label: __( 'Reviewer', 'sit-cwm' ),
			getValue: ( { item } ) => ( item.reviewer ? item.reviewer.id : 0 ),
			render: ReviewerCell,
			elements: [
				{ value: 0, label: __( 'Unassigned', 'sit-cwm' ) },
				...userElements( reviewers ),
			],
			enableSorting: false,
			filterBy: { operators: FILTER_OPERATORS.reviewer },
		},
		{
			id: 'due_date',
			type: 'date',
			label: __( 'Due', 'sit-cwm' ),
			getValue: ( { item } ) => item.due_date || '',
			render: DueDateCell,
			enableSorting: true,
			filterBy: { operators: FILTER_OPERATORS.due_date },
		},
		{
			id: 'author',
			type: 'integer',
			label: __( 'Author', 'sit-cwm' ),
			getValue: ( { item } ) => ( item.author ? item.author.id : 0 ),
			render: AuthorCell,
			elements: authorElements,
			enableSorting: false,
			// Without options the filter would be a raw user id input.
			filterBy: authorElements.length
				? { operators: FILTER_OPERATORS.author }
				: false,
		},
		{
			id: 'post_type',
			type: 'text',
			label: __( 'Type', 'sit-cwm' ),
			getValue: ( { item } ) => item.post_type,
			render: PostTypeCell,
			elements: ( Array.isArray( postTypes ) ? postTypes : [] )
				.filter( Boolean )
				.map( ( type ) => ( {
					value: type.slug,
					label: type.singularLabel,
				} ) ),
			enableSorting: false,
			filterBy: { operators: FILTER_OPERATORS.post_type },
		},
		{
			id: 'last_activity',
			label: __( 'Last activity', 'sit-cwm' ),
			getValue: ( { item } ) => item.last_activity?.created_at || '',
			render: LastActivityCell,
			enableSorting: false,
			filterBy: false,
		},
	];
}
