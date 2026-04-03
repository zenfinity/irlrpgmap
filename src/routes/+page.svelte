<script>
	import Map from '$lib/Map.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	/** @type {HTMLInputElement} */
	let fileInput;

	let uploading = $state(false);

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

			if (res.ok) await invalidateAll();
		} finally {
			uploading = false;
			fileInput.value = '';
		}
	}

	async function clearMap() {
		await fetch('/api/import', { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<header>
	<span class="wordmark">irlrpgmap</span>
	<nav>
		<ul>
			<li>
				<details class="dropdown">
					<summary></summary>
					<ul dir="rtl">
						<li>
							<a href="#" onclick={(e) => { e.preventDefault(); fileInput.click(); }}>
								{uploading ? 'Importing…' : 'Import'}
							</a>
						</li>
						{#if data.places.length > 0}
							<li>
								<a href="#" onclick={(e) => { e.preventDefault(); clearMap(); }}>Clear map</a>
							</li>
						{/if}
						<li>
							<a href="https://github.com/zenfinity/irlrpgmap" target="_blank" rel="noopener">GitHub</a>
						</li>
					</ul>
				</details>
			</li>
		</ul>
	</nav>
</header>

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
</style>
