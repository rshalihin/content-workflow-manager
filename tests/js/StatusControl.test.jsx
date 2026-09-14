/**
 * External dependencies
 */
import { render, screen } from '@testing-library/react';

/**
 * Internal dependencies
 */
import StatusControl from '../../src/sidebar/components/StatusControl';

describe( 'StatusControl', () => {
	beforeEach( () => {
		window.sitCwm.statuses = [
			{
				slug: 'approved',
				label: 'Approved',
				description: 'Cleared for publication.',
				color: '#00a32a',
				order: 50,
				is_final: false,
			},
		];
	} );

	it( 'renders the label and the registered colour', () => {
		const { container } = render(
			<StatusControl status="approved" label="Approved" />
		);

		expect( screen.getByText( 'Approved' ) ).toBeTruthy();
		expect( screen.getByText( 'Cleared for publication.' ) ).toBeTruthy();
		expect(
			container.querySelector( '.sit-cwm-status-swatch' ).style
				.backgroundColor
		).toBe( 'rgb(0, 163, 42)' );
	} );

	it( 'falls back to the slug and the default colour for unknown statuses', () => {
		const { container } = render( <StatusControl status="legacy" /> );

		expect( screen.getByText( 'legacy' ) ).toBeTruthy();
		expect(
			container.querySelector( '.sit-cwm-status-swatch' ).style
				.backgroundColor
		).toBe( 'rgb(117, 117, 117)' );
	} );
} );
