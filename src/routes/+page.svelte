<script>
	import Map from '$lib/Map.svelte';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

	/** @type {HTMLInputElement} */
	let fileInput;
	/** @type {HTMLDialogElement} */
	let dialog;

	let authMode = $state('existing'); // 'new' | 'existing'
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let authError = $state('');
	let submitting = $state(false);
	let uploading = $state(false);

	function openModal() {
		authError = '';
		dialog.showModal();
	}

	async function handleFile(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		uploading = true;
		try {
			const text = await file.text();
			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-filename': file.name },
				body: text
			});
			if (res.ok) {
				await invalidateAll();
				dialog.close();
			}
		} finally {
			uploading = false;
			fileInput.value = '';
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
				if (error) { authError = error.message; return; }
			} else {
				const { error } = await authClient.signIn.email({ email, password });
				if (error) { authError = error.message; return; }
			}
			await invalidateAll();
			dialog.close();
		} finally {
			submitting = false;
		}
	}

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		dialog.close();
	}
</script>

<header>
	<span class="wordmark">irlrpgmap</span>
	<nav>
		<ul>
			<li>
				<button class="account-btn" onclick={openModal}>
					{data.user ? data.user.name : 'Sign in'}
				</button>
			</li>
			<li>
				<details class="dropdown">
					<summary></summary>
					<ul dir="rtl">
						<li>
							<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener">GitHub</a>
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
			{#if data.places.length === 0}
				<div class="explainer">
					<p>Import your location history from <strong>Google Takeout</strong> to populate your map.</p>
					<ol>
						<li>Go to <a href="https://takeout.google.com" target="_blank" rel="noopener">takeout.google.com</a></li>
						<li>Deselect all, then select <strong>Location History (Timeline)</strong></li>
						<li>Export and download the zip</li>
						<li>Inside the zip, find <code>Semantic Location History</code> → open any year/month JSON file</li>
						<li>Import it below — repeat for as many files as you like</li>
					</ol>
				</div>
			{/if}
			<div class="account-actions">
				<button onclick={() => fileInput.click()} disabled={uploading}>
					{uploading ? 'Importing…' : 'Import map data'}
				</button>
				{#if data.places.length > 0}
					<button class="secondary" onclick={clearMap}>Clear map</button>
				{/if}
			</div>
			{#if data.importLog.length > 0}
				<div class="import-log">
					<p>Import history</p>
					<ul>
						{#each data.importLog as entry}
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
					<a href="#" onclick={(e) => { e.preventDefault(); authMode = 'existing'; authError = ''; }}>Sign in</a>
				{:else}
					New here?
					<a href="#" onclick={(e) => { e.preventDefault(); authMode = 'new'; authError = ''; }}>Create account</a>
				{/if}
			</footer>
		{/if}
	</article>
</dialog>

<input bind:this={fileInput} type="file" accept=".json" onchange={handleFile} />

<Map places={data.places} />

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

	.explainer ol {
		margin: 0;
		padding-left: 1.25rem;
	}

	.explainer li {
		margin-bottom: 0.25rem;
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
</style>
