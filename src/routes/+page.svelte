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
				headers: { 'Content-Type': 'application/json' },
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
			<div class="account-actions">
				<button onclick={() => fileInput.click()} disabled={uploading}>
					{uploading ? 'Importing…' : 'Import map data'}
				</button>
				{#if data.places.length > 0}
					<button class="secondary" onclick={clearMap}>Clear map</button>
				{/if}
			</div>
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
		max-width: 22rem;
		width: 90vw;
	}
</style>
