/**
 * External dependencies
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Internal dependencies
 */
import TransitionActions from '../../src/sidebar/components/TransitionActions';

const approve = {
	slug: 'approved',
	label: 'Approved',
	is_forward: true,
	is_rollback: false,
};
const sendBack = {
	slug: 'needs_changes',
	label: 'Needs Changes',
	is_forward: false,
	is_rollback: true,
};

describe( 'TransitionActions', () => {
	beforeEach( () => {
		window.sitCwm.statuses = [
			{ slug: 'approved', label: 'Approved', is_final: false },
			{ slug: 'needs_changes', label: 'Needs Changes', is_final: false },
			{ slug: 'published', label: 'Published', is_final: true },
		];
	} );

	it( 'renders exactly the allowed transitions', () => {
		render(
			<TransitionActions
				transitions={ [ approve, sendBack ] }
				onTransition={ jest.fn() }
				isSaving={ false }
			/>
		);

		expect(
			screen
				.getAllByRole( 'button' )
				.map( ( button ) => button.textContent )
		).toEqual( [ 'Move to Approved', 'Move to Needs Changes' ] );
		expect(
			screen
				.getByRole( 'button', { name: 'Move to Needs Changes' } )
				.classList.contains( 'is-destructive' )
		).toBe( true );
	} );

	it( 'renders no buttons when nothing is allowed', () => {
		render(
			<TransitionActions
				transitions={ [] }
				onTransition={ jest.fn() }
				isSaving={ false }
			/>
		);

		expect( screen.queryAllByRole( 'button' ) ).toEqual( [] );
	} );

	it( 'runs a forward transition directly', async () => {
		const onTransition = jest.fn().mockResolvedValue( null );
		const user = userEvent.setup();

		render(
			<TransitionActions
				transitions={ [ approve ] }
				onTransition={ onTransition }
				isSaving={ false }
			/>
		);

		await user.click(
			screen.getByRole( 'button', { name: 'Move to Approved' } )
		);

		expect( onTransition ).toHaveBeenCalledWith( 'approved' );
	} );

	it( 'confirms a rollback before running it', async () => {
		const onTransition = jest.fn().mockResolvedValue( null );
		const user = userEvent.setup();

		render(
			<TransitionActions
				transitions={ [ sendBack ] }
				onTransition={ onTransition }
				isSaving={ false }
			/>
		);

		await user.click(
			screen.getByRole( 'button', { name: 'Move to Needs Changes' } )
		);

		expect( onTransition ).not.toHaveBeenCalled();

		const dialog = screen.getByRole( 'dialog' );
		const confirm = [ ...dialog.querySelectorAll( 'button' ) ].find(
			( button ) => button.textContent === 'Move to Needs Changes'
		);

		await user.click( confirm );

		expect( onTransition ).toHaveBeenCalledWith( 'needs_changes' );
		expect( screen.queryByRole( 'dialog' ) ).toBeNull();
	} );

	it( 'disables every action while saving', () => {
		render(
			<TransitionActions
				transitions={ [ approve, sendBack ] }
				onTransition={ jest.fn() }
				isSaving
			/>
		);

		screen
			.getAllByRole( 'button' )
			.forEach( ( button ) => expect( button.disabled ).toBe( true ) );
	} );
} );
