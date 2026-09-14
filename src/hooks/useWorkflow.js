/**
 * The single data hook for a post's workflow.
 */

/**
 * WordPress dependencies
 */
import { useDispatch } from '@wordpress/data';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { store as noticesStore } from '@wordpress/notices';

/**
 * Internal dependencies
 */
import * as client from '../api/client';

/**
 * Error returned when a mutation is attempted while another is running or
 * before the workflow has loaded.
 *
 * @type {import('../api/client').ApiError}
 */
const BUSY = { code: 'sit_cwm_busy', message: '', status: 0 };

/**
 * Loads and mutates a post's workflow through the REST API.
 *
 * The server is the source of truth: mutations are not applied optimistically.
 * Each one sets `isSaving`, then replaces `workflow` with the server response.
 *
 * Mutations resolve to `null` on success or the normalized error on failure,
 * so callers can react locally. Workflow mutations (status, reviewer, due date)
 * also expose their failure as `error`; `addComment` leaves that to the caller.
 *
 * A status change sends `{ from, status }` with the status the user saw. On a
 * 409 the hook refetches and reports that the post changed elsewhere rather
 * than retrying. A 403 also refetches, so revoked permissions stop being offered.
 *
 * @param {number} postId Post id.
 * @return {Object} `{ workflow, isLoading, isSaving, error, activityVersion,
 *                  updateStatus, assignReviewer, setDueDate, addComment,
 *                  refresh, clearError }`.
 */
export default function useWorkflow( postId ) {
	const [ workflow, setWorkflow ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( Boolean( postId ) );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ activityVersion, setActivityVersion ] = useState( 0 );
	const { createSuccessNotice } = useDispatch( noticesStore );

	// Bumped when the post changes or the hook unmounts; responses from an
	// older generation are ignored.
	const generationRef = useRef( 0 );
	const postIdRef = useRef( postId );
	const controllersRef = useRef( new Set() );
	const savingRef = useRef( false );

	const refresh = useCallback( async () => {
		const generation = generationRef.current;
		const controller = new window.AbortController();

		controllersRef.current.add( controller );
		setIsLoading( true );

		try {
			const data = await client.getWorkflow( postIdRef.current, {
				signal: controller.signal,
			} );

			if ( generation === generationRef.current ) {
				setWorkflow( data );
				setError( null );
			}

			return data;
		} catch ( err ) {
			if (
				generation === generationRef.current &&
				! client.isAbortError( err )
			) {
				setError( err );
			}

			return null;
		} finally {
			controllersRef.current.delete( controller );

			if ( generation === generationRef.current ) {
				setIsLoading( false );
			}
		}
	}, [] );

	useEffect( () => {
		const controllers = controllersRef.current;

		postIdRef.current = postId;
		savingRef.current = false;
		setWorkflow( null );
		setError( null );
		setIsSaving( false );
		setIsLoading( Boolean( postId ) );

		if ( postId ) {
			refresh();
		}

		return () => {
			generationRef.current += 1;
			controllers.forEach( ( controller ) => controller.abort() );
			controllers.clear();
		};
	}, [ postId, refresh ] );

	/**
	 * Runs one mutation with the shared saving guard.
	 *
	 * @param {Function} send                Performs the request.
	 * @param {Object}   options             Options.
	 * @param {boolean}  options.exposeError Whether a failure sets `error`.
	 * @return {Promise<{data: *, error: ?Object}>} Result.
	 */
	const run = useCallback(
		async ( send, { exposeError } ) => {
			if ( savingRef.current || ! postIdRef.current ) {
				return { data: null, error: BUSY };
			}

			const generation = generationRef.current;

			savingRef.current = true;
			setIsSaving( true );

			try {
				const data = await send( postIdRef.current );

				if ( generation === generationRef.current ) {
					setActivityVersion( ( version ) => version + 1 );
				}

				return { data, error: null };
			} catch ( err ) {
				if ( generation !== generationRef.current || ! exposeError ) {
					return { data: null, error: err };
				}

				let reported = err;

				if ( err.status === 409 ) {
					await refresh();
					reported = {
						...err,
						message: __(
							'This post changed elsewhere — refreshed.',
							'sit-cwm'
						),
					};
				} else if ( err.status === 403 ) {
					await refresh();
				}

				if ( generation === generationRef.current ) {
					setError( reported );
				}

				return { data: null, error: reported };
			} finally {
				if ( generation === generationRef.current ) {
					savingRef.current = false;
					setIsSaving( false );
				}
			}
		},
		[ refresh ]
	);

	/**
	 * Sends a workflow update and applies the server response.
	 *
	 * @param {Object} payload REST payload.
	 * @return {Promise<{data: *, error: ?Object}>} Result.
	 */
	const update = useCallback(
		async ( payload ) => {
			const generation = generationRef.current;
			const result = await run(
				( id ) => client.updateWorkflow( id, payload ),
				{ exposeError: true }
			);

			if ( result.data && generation === generationRef.current ) {
				setWorkflow( result.data );
				setError( null );
			}

			return result;
		},
		[ run ]
	);

	const updateStatus = useCallback(
		async ( to ) => {
			if ( ! workflow ) {
				return BUSY;
			}

			// `from` is the status this render showed the user.
			const { data, error: err } = await update( {
				from: workflow.status,
				status: to,
			} );

			if ( data ) {
				createSuccessNotice(
					sprintf(
						/* translators: %s: Workflow status label. */
						__( 'Workflow status changed to %s.', 'sit-cwm' ),
						data.status_label
					),
					{ id: 'sit-cwm-status-changed', type: 'snackbar' }
				);
			}

			return err;
		},
		[ workflow, update, createSuccessNotice ]
	);

	const assignReviewer = useCallback(
		async ( reviewerId ) => {
			const { error: err } = await update( {
				reviewer_id: parseInt( reviewerId, 10 ) || 0,
			} );

			return err;
		},
		[ update ]
	);

	const setDueDate = useCallback(
		async ( date ) => {
			const { error: err } = await update( { due_date: date || '' } );

			return err;
		},
		[ update ]
	);

	const addComment = useCallback(
		async ( message ) => {
			const { error: err } = await run(
				( id ) => client.addComment( id, message ),
				{ exposeError: false }
			);

			return err;
		},
		[ run ]
	);

	const clearError = useCallback( () => setError( null ), [] );

	return {
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
	};
}
