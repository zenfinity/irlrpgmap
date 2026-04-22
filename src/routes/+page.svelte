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
	let effectiveTheme = $state(/** @type {'dark'|'light'} */ ('dark'));

	function dismissWelcome() {
		localStorage.setItem('irlrpg_welcomed', '1');
		welcomeDialog.close();
	}

	function handleWuzHereClick() {
		wuzHerePulse = false;
		localStorage.setItem('irlrpg_wuz_here_used', '1');
		wuzHere.open();
	}

	function toggleTheme() {
		const next = effectiveTheme === 'dark' ? 'light' : 'dark';
		effectiveTheme = next;
		localStorage.setItem('irlrpg_theme', next);
		document.documentElement.dataset.theme = next;
		dropdown.open = false;
	}

	onMount(() => {
		const saved = localStorage.getItem('irlrpg_theme');
		if (saved === 'dark' || saved === 'light') {
			effectiveTheme = saved;
		} else {
			effectiveTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
		}
		if (!localStorage.getItem('irlrpg_welcomed')) {
			welcomeDialog.showModal();
		}
		if (data.user && !localStorage.getItem('irlrpg_wuz_here_used')) {
			wuzHerePulse = true;
		}
	});
</script>

<header class="page-header">
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
			<li>
				<details class="dropdown" bind:this={dropdown}>
					<summary aria-label="Menu">⋮</summary>
					<ul>
						<li>
							<button onclick={() => { dropdown.open = false; openModal(); }}>
								{data.user ? data.user.name : 'Sign in'}
							</button>
						</li>
						<li><hr /></li>
						<li>
							<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener" onclick={() => dropdown.open = false}>GitHub</a>
						</li>
						<li>
							<button onclick={openFeedback}>Feedback</button>
						</li>
						<li><hr /></li>
						<li>
							<button onclick={toggleTheme}>
								{effectiveTheme === 'dark' ? '☀ Light mode' : '◑ Dark mode'}
							</button>
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
				<h3>{data.user.name}</h3>
				<button class="close" aria-label="Close" onclick={() => dialog.close()}></button>
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
				<h3>{authMode === 'new' ? 'Create account' : 'Sign in'}</h3>
				<button class="close" aria-label="Close" onclick={() => dialog.close()}></button>
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
			<h3>Feedback</h3>
			<button class="close" aria-label="Close" onclick={() => feedbackDialog.close()}></button>
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
	theme={effectiveTheme}
	onNeighborhoodSelect={(name) => { activeNeighborhood = name; neighborhoodData = null; }}
	onNeighborhoodHover={(name) => { hoveredNeighborhood = name; }}
/>

{#if data.user}
	<button class="wuz-here-fab" class:pulse={wuzHerePulse} onclick={handleWuzHereClick}>Wuz Here</button>
{/if}

<WuzHere bind:this={wuzHere} onDone={invalidateAll} center={mapCenter} />

<style>
	.page-header {
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

	.wordmark {
		font-family: 'Press Start 2P', monospace;
		font-size: 0.75rem;
		color: var(--color-accent);
		letter-spacing: 0.05em;
		white-space: nowrap;
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

	.page-header > nav {
		margin-left: auto;
	}

	nav > ul {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.start-here {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		animation: pulse 2s ease-in-out infinite;
		white-space: nowrap;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 1; }
	}

	@media (max-width: 400px) {
		.wordmark { display: none; }
	}

	.account-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.account-actions button { width: 100%; }

	.auth-error {
		color: var(--color-danger);
		font-size: 0.875rem;
		margin-top: -0.5rem;
	}

	dialog article {
		max-width: 26rem;
		width: 90vw;
	}

	.import-log {
		font-size: 0.8rem;
		margin-bottom: 1rem;
		border-top: 1px solid var(--color-border);
		padding-top: 0.75rem;
	}

	.import-log p {
		margin: 0 0 0.4rem;
		font-weight: 600;
		color: var(--color-text-muted);
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

	.log-meta { color: var(--color-text-muted); }

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
		font-size: 0.75rem;
		color: var(--color-text-muted);
		pointer-events: none;
		white-space: nowrap;
	}

	.tab {
		padding: 0.3em 0.65em;
		font-size: 0.55rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.tab.active {
		color: var(--color-accent);
		border-color: var(--color-accent);
		background: var(--color-accent-dim);
	}

	.welcome-dialog article {
		max-width: 28rem;
		width: 90vw;
		text-align: center;
	}

	.welcome-dialog h3 {
		font-size: 0.7rem;
		margin-bottom: 0.75rem;
	}

	.welcome-dialog p {
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}

	.welcome-dialog footer { justify-content: center; }

	.wuz-here-fab {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		z-index: 10;
		padding: 0.75rem 1.4rem;
		font-size: 0.6rem;
		box-shadow: var(--shadow);
	}

	.wuz-here-fab.pulse {
		animation: wuz-pulse 2s ease-in-out infinite;
	}

	@keyframes wuz-pulse {
		0%, 100% { box-shadow: var(--shadow); transform: translate(0, 0); }
		50% {
			box-shadow: 6px 6px 0 var(--color-accent-dim);
			transform: translate(-1px, -1px);
		}
	}
</style>
