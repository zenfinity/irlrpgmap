<script>
	import Map from '$lib/Map.svelte';
	import WuzHere from '$lib/WuzHere.svelte';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { onMount } from 'svelte';

	let { data } = $props();

	let dialog = $state();
	let dropdown = $state();
	let feedbackDialog = $state();
	let welcomeDialog = $state();
	let wuzHere = $state(/** @type {import('$lib/WuzHere.svelte').default} */ (/** @type {unknown} */ (undefined)));

	const mapCenter = $derived.by(() => {
		if (!data.places.length) return null;
		const lat = data.places.reduce((s, p) => s + p.lat, 0) / data.places.length;
		const lng = data.places.reduce((s, p) => s + p.lng, 0) / data.places.length;
		return { lat, lng };
	});

	let activeNeighborhood = $state(/** @type {string|null} */ (null));
	let hoveredNeighborhood = $state(/** @type {string|null} */ (null));
	let neighborhoodData = $state(/** @type {{polygon: {type: string, coordinates: any}|null, userPolygon: {type: string, coordinates: any}|null, completionPct: number|null}|null} */ (null));

	$effect(() => {
		const n = activeNeighborhood;
		if (!n) { neighborhoodData = null; return; }
		// No-neighborhood places grouped under sentinel — no polygon to fetch
		if (n === '__ungrouped__') {
			neighborhoodData = { polygon: null, userPolygon: null, completionPct: null };
			return;
		}
		// Seed boundary immediately from already-loaded page data so the dungeon
		// wall appears without waiting for the API round-trip
		const cached = data.neighborhoods.find((nb) => nb.name === n);
		neighborhoodData = { polygon: cached?.polygon ?? null, userPolygon: null, completionPct: cached?.completionPct ?? null };
		// Then fetch userPolygon + fresh completionPct
		fetch(`/api/neighborhoods/${encodeURIComponent(n)}`)
			.then((r) => r.json())
			.then((d) => { if (activeNeighborhood === n) neighborhoodData = d; });
	});

	let authMode = $state('existing'); // 'new' | 'existing'
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let authError = $state('');
	let submitting = $state(false);

	let feedbackTitle = $state('');
	let feedbackMessage = $state('');
	let feedbackError = $state('');
	let feedbackSubmitting = $state(false);
	let feedbackDone = $state(false);

	function openModal() {
		authError = '';
		dialog.showModal();
	}

	function openFeedback() {
		feedbackTitle = '';
		feedbackMessage = '';
		feedbackError = '';
		feedbackDone = false;
		dropdown.open = false;
		feedbackDialog.showModal();
	}

	async function submitFeedback() {
		feedbackError = '';
		feedbackSubmitting = true;
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: feedbackTitle, message: feedbackMessage })
			});
			if (!res.ok) {
				const text = await res.text();
				feedbackError = text || 'Something went wrong. Try again.';
				return;
			}
			feedbackDone = true;
		} finally {
			feedbackSubmitting = false;
		}
	}

	async function clearMap() {
		await fetch('/api/import', { method: 'DELETE' });
		await invalidateAll();
		dialog.close();
	}

	async function handleAuth() {
		authError = '';
		submitting = true;
		try {
			if (authMode === 'new') {
				const { error } = await authClient.signUp.email({ name, email, password });
				if (error) { authError = error.message ?? 'Unknown error'; return; }
			} else {
				const { error } = await authClient.signIn.email({ email, password });
				if (error) { authError = error.message ?? 'Unknown error'; return; }
			}
			await invalidateAll();
			dialog.close();
			if (!localStorage.getItem('irlrpg_wuz_here_used')) {
				wuzHerePulse = true;
			}
		} finally {
			submitting = false;
		}
	}

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		dialog.close();
	}

	let wuzHerePulse = $state(false);

	function dismissWelcome() {
		localStorage.setItem('irlrpg_welcomed', '1');
		welcomeDialog.close();
	}

	function handleWuzHereClick() {
		wuzHerePulse = false;
		localStorage.setItem('irlrpg_wuz_here_used', '1');
		wuzHere.open();
	}

	onMount(() => {
		if (!localStorage.getItem('irlrpg_welcomed')) {
			welcomeDialog.showModal();
		}
		if (data.user && !localStorage.getItem('irlrpg_wuz_here_used')) {
			wuzHerePulse = true;
		}
	});
</script>

<header>
	<span class="wordmark">irlrpgmap</span>
	{#if activeNeighborhood}
		<nav class="tabs">
			<button class="tab" onclick={() => activeNeighborhood = null}>World</button>
			<button class="tab active">
				{activeNeighborhood === '__ungrouped__' ? 'Uncharted' : activeNeighborhood}{neighborhoodData?.completionPct != null ? ` · ${neighborhoodData.completionPct}%` : ''}
			</button>
		</nav>
	{:else if hoveredNeighborhood}
		<span class="neighborhood-hover-label">{hoveredNeighborhood}</span>
	{/if}
	<nav>
		<ul>
			{#if !data.user}
				<li><span class="start-here">start here →</span></li>
			{/if}
			<li class="account-btn-wrap">
				<button class="account-btn" onclick={openModal}>
					{data.user ? data.user.name : 'Sign in'}
				</button>
			</li>
			<li>
				<details class="dropdown" bind:this={dropdown}>
					<summary></summary>
					<ul dir="rtl">
						<li class="mobile-menu-account">
							<button onclick={() => { dropdown.open = false; openModal(); }}>
								{data.user ? data.user.name : 'Sign in'}
							</button>
						</li>
						<li>
							<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener" onclick={() => dropdown.open = false}>GitHub</a>
						</li>
						<li>
							<button onclick={openFeedback}>Feedback</button>
						</li>
					</ul>
				</details>
			</li>
		</ul>
	</nav>
</header>

<dialog bind:this={dialog}>
	<article>
		{#if data.user}
			<header>
				<button class="close" aria-label="Close" onclick={() => dialog.close()}></button>
				<h3>{data.user.name}</h3>
			</header>
			{#if data.places.length > 0}
				<div class="account-actions">
					<button class="secondary" onclick={clearMap}>Clear map</button>
				</div>
			{/if}
			{#if data.importLog.length > 0}
				<div class="import-log">
					<p>Import history</p>
					<ul>
						{#each data.importLog as entry (entry.imported_at)}
							<li>
								<span class="log-filename">{entry.filename}</span>
								<span class="log-meta">{entry.imported_count} places · {new Date(entry.imported_at).toLocaleString()}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<footer>
				<button class="outline secondary" onclick={signOut}>Sign out</button>
			</footer>
		{:else}
			<header>
				<button class="close" aria-label="Close" onclick={() => dialog.close()}></button>
				<h3>{authMode === 'new' ? 'Create account' : 'Sign in'}</h3>
			</header>
			<form onsubmit={(e) => { e.preventDefault(); handleAuth(); }}>
				{#if authMode === 'new'}
					<label>
						Username
						<input type="text" bind:value={name} required autocomplete="username" />
					</label>
				{/if}
				<label>
					Email
					<input type="email" bind:value={email} required autocomplete="email" />
				</label>
				<label>
					Password
					<input type="password" bind:value={password} required autocomplete={authMode === 'new' ? 'new-password' : 'current-password'} />
				</label>
				{#if authError}
					<p class="auth-error">{authError}</p>
				{/if}
				<button type="submit" disabled={submitting} aria-busy={submitting}>
					{authMode === 'new' ? 'Create account' : 'Sign in'}
				</button>
			</form>
			<footer>
				{#if authMode === 'new'}
					Already have an account?
					<button class="link" onclick={() => { authMode = 'existing'; authError = ''; }}>Sign in</button>
				{:else}
					New here?
					<button class="link" onclick={() => { authMode = 'new'; authError = ''; }}>Create account</button>
				{/if}
			</footer>
		{/if}
	</article>
</dialog>

<dialog bind:this={feedbackDialog}>
	<article>
		<header>
			<button class="close" aria-label="Close" onclick={() => feedbackDialog.close()}></button>
			<h3>Feedback</h3>
		</header>
		{#if feedbackDone}
			<p>Thanks! Your feedback has been submitted.</p>
			<footer>
				<button onclick={() => feedbackDialog.close()}>Close</button>
			</footer>
		{:else}
			<p class="feedback-intro">Found a bug or have an idea? We'd love to hear it. If you have a GitHub account you can also <a href="https://github.com/zenfinity/irlrpgmap/issues/new" target="_blank" rel="noopener">open an issue directly</a>.</p>
			<form onsubmit={(e) => { e.preventDefault(); submitFeedback(); }}>
				<label>
					Title
					<input type="text" bind:value={feedbackTitle} required placeholder="Brief summary" />
				</label>
				<label>
					Message
					<textarea bind:value={feedbackMessage} required placeholder="Describe the issue or idea…" rows="5"></textarea>
				</label>
				{#if feedbackError}
					<p class="auth-error">{feedbackError}</p>
				{/if}
				<button type="submit" disabled={feedbackSubmitting} aria-busy={feedbackSubmitting}>
					Submit
				</button>
			</form>
		{/if}
	</article>
</dialog>

<dialog bind:this={welcomeDialog} class="welcome-dialog">
	<article>
		<header>
			<h3>Welcome to irlrpgmap 🗺️</h3>
		</header>
		<p>This is a map to help you bring discovery to everyday life. 🌍✨</p>
		<p>Everything is hidden until you add locations you've been. The more you explore, the more the fog lifts — like an RPG unfolding in real life. 🧭⚔️</p>
		<p>So <strong>Sign In</strong> and get out there! 🚀</p>
		<footer>
			<button onclick={dismissWelcome}>Let's Go! 🎉</button>
		</footer>
	</article>
</dialog>

<Map
	places={data.places}
	neighborhoods={data.neighborhoods}
	{activeNeighborhood}
	{neighborhoodData}
	onNeighborhoodSelect={(name) => { activeNeighborhood = name; neighborhoodData = null; }}
	onNeighborhoodHover={(name) => { hoveredNeighborhood = name; }}
/>

{#if data.user}
	<button class="wuz-here-fab" class:pulse={wuzHerePulse} onclick={handleWuzHereClick}>Wuz Here</button>
{/if}

<WuzHere bind:this={wuzHere} onDone={invalidateAll} center={mapCenter} />

<style>
	header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 10;
		height: var(--header-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
		overflow: visible;
	}

	details {
		align-self: center;
		margin: 0;
		position: relative;
		z-index: 20;
	}

	summary:focus-visible {
		outline: none;
	}

	input[type='file'] {
		display: none;
	}

	nav ul {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.mobile-menu-account {
		display: none;
	}

	.start-here {
		font-size: 0.75rem;
		color: var(--pico-muted-color);
		animation: pulse 2s ease-in-out infinite;
		white-space: nowrap;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 1; }
	}

	@media (max-width: 480px) {
		.account-btn-wrap {
			display: none;
		}
		.mobile-menu-account {
			display: block;
		}
	}

	.account-btn {
		margin: 0;
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
	}

	.account-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.account-actions button {
		width: 100%;
		margin: 0;
	}

	.auth-error {
		color: var(--pico-del-color);
		font-size: 0.875rem;
		margin-top: -0.5rem;
	}

	dialog article {
		max-width: 26rem;
		width: 90vw;
	}

	.explainer {
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.explainer p {
		margin-bottom: 0.5rem;
	}

.import-log {
		font-size: 0.8rem;
		margin-bottom: 1rem;
		border-top: 1px solid var(--pico-muted-border-color);
		padding-top: 0.75rem;
	}

	.import-log p {
		margin: 0 0 0.4rem;
		font-weight: 600;
		color: var(--pico-muted-color);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.7rem;
	}

	.import-log ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.import-log li {
		display: flex;
		flex-direction: column;
		margin-bottom: 0.4rem;
	}

	.log-filename {
		font-weight: 500;
		word-break: break-all;
	}

	.log-meta {
		color: var(--pico-muted-color);
	}

	.feedback-intro {
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.tabs {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.neighborhood-hover-label {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.8rem;
		color: var(--pico-muted-color);
		pointer-events: none;
		white-space: nowrap;
	}

	.tab {
		--pico-form-element-spacing-vertical: 0.2rem;
		--pico-form-element-spacing-horizontal: 0.65rem;
		margin: 0;
		font-size: 0.8rem;
		background: none;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		color: var(--pico-muted-color);
		white-space: nowrap;
	}

	.tab.active {
		color: var(--pico-primary);
		border-color: var(--pico-primary);
		background: var(--pico-primary-background);
	}

	.welcome-dialog article {
		max-width: 28rem;
		width: 90vw;
		text-align: center;
	}

	.welcome-dialog h3 {
		font-size: 1.3rem;
		margin-bottom: 0;
	}

	.welcome-dialog p {
		font-size: 0.95rem;
		margin-bottom: 0.75rem;
	}

	.welcome-dialog footer {
		justify-content: center;
	}

	.wuz-here-fab {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		z-index: 10;
		margin: 0;
		border-radius: 2rem;
		padding: 0.6rem 1.25rem;
		font-size: 0.9rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.wuz-here-fab.pulse {
		animation: wuz-pulse 2s ease-in-out infinite;
	}

	@keyframes wuz-pulse {
		0%, 100% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); transform: scale(1); }
		50% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--pico-primary) 35%, transparent), 0 2px 8px rgba(0, 0, 0, 0.2); transform: scale(1.08); }
	}
</style>
