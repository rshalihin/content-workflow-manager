/**
 * Internal dependencies
 */
import buildActions from '../../src/dashboard/actions';

const row = ( overrides = {} ) => ( {
	post_id: 12,
	title: 'Launch plan',
	status: 'review',
	status_label: 'Review',
	edit_link: 'http://example.org/wp-admin/post.php?post=12&action=edit',
	available_transitions: [],
	capabilities: {
		can_change_status: false,
		can_assign_reviewer: false,
		can_set_due_date: false,
	},
	...overrides,
} );

const eligible = ( item ) =>
	buildActions( { onChanged: () => {} } )
		.filter( ( action ) => action.isEligible( item ) )
		.map( ( action ) => action.id );

describe( 'dashboard row actions', () => {
	it( 'defines single-row actions only', () => {
		const actions = buildActions( { onChanged: () => {} } );

		expect( actions.map( ( action ) => action.id ) ).toEqual( [
			'edit',
			'approve',
			'request-changes',
			'assign-reviewer',
			'set-due-date',
		] );
		actions.forEach( ( action ) =>
			expect( action.supportsBulk ).toBeFalsy()
		);
	} );

	it( 'offers only Edit when the server offers nothing else', () => {
		expect( eligible( row() ) ).toEqual( [ 'edit' ] );
	} );

	it( 'offers status actions only for transitions the server lists', () => {
		expect(
			eligible(
				row( {
					available_transitions: [
						{ slug: 'approved', is_rollback: false },
						{ slug: 'needs_changes', is_rollback: true },
					],
				} )
			)
		).toEqual( [ 'edit', 'approve', 'request-changes' ] );

		expect(
			eligible(
				row( {
					available_transitions: [ { slug: 'needs_changes' } ],
				} )
			)
		).toEqual( [ 'edit', 'request-changes' ] );
	} );

	it( 'offers reviewer and due date actions from the row capabilities', () => {
		expect(
			eligible(
				row( {
					capabilities: {
						can_assign_reviewer: true,
						can_set_due_date: true,
					},
				} )
			)
		).toEqual( [ 'edit', 'assign-reviewer', 'set-due-date' ] );
	} );

	it( 'hides Edit without a safe edit link', () => {
		expect( eligible( row( { edit_link: '' } ) ) ).toEqual( [] );
		expect(
			eligible( row( { edit_link: 'javascript:alert(1)' } ) )
		).toEqual( [] );
	} );

	it( 'tolerates rows without hints', () => {
		expect(
			eligible( {
				post_id: 1,
				edit_link: '',
				available_transitions: null,
			} )
		).toEqual( [] );
	} );
} );
