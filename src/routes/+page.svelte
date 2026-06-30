<script lang="ts">
	import { enhance } from '$app/forms';
	import imageCompression from 'browser-image-compression';
	import type { KasEntry } from '$lib/types.js';

	let entries = $state<KasEntry[]>([]);
	const monthNames = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];
	let selectedMonth = $state(monthNames[new Date().getMonth()]);

	$effect(() => {
		if (entries.length > 0 && entries[0].tanggal) {
			const dateStr = entries[0].tanggal;
			const months = [
				{ name: 'Januari', regex: /jan/i },
				{ name: 'Februari', regex: /feb/i },
				{ name: 'Maret', regex: /mar/i },
				{ name: 'April', regex: /apr/i },
				{ name: 'Mei', regex: /mei|may/i },
				{ name: 'Juni', regex: /jun/i },
				{ name: 'Juli', regex: /jul/i },
				{ name: 'Agustus', regex: /agu|aug/i },
				{ name: 'September', regex: /sep/i },
				{ name: 'Oktober', regex: /okt|oct/i },
				{ name: 'November', regex: /nov/i },
				{ name: 'Desember', regex: /des|dec/i }
			];
			for (const m of months) {
				if (m.regex.test(dateStr)) {
					selectedMonth = m.name;
					break;
				}
			}
		}
	});

	let isCompressing = $state(false);
	let isExtracting = $state(false);
	let isSaving = $state(false);
	let toast = $state<{ message: string; type: 'success' | 'error' } | null>(null);
	let dragOver = $state(false);
	let selectedFile = $state<File | null>(null);
	let fileInputRef: HTMLInputElement | undefined = $state();

	async function compressImage(file: File): Promise<File> {
		const options = {
			maxSizeMB: 1,
			maxWidthOrHeight: 1920,
			useWebWorker: true
		};
		const compressed = await imageCompression(file, options);
		return new File([compressed], file.name, { type: compressed.type });
	}

	function showToast(message: string, type: 'success' | 'error') {
		toast = { message, type };
		setTimeout(() => {
			toast = null;
		}, 5000);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file && file.type.startsWith('image/')) {
			selectedFile = file;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) {
			selectedFile = input.files[0];
		}
	}

	function removeFile() {
		selectedFile = null;
		if (fileInputRef) {
			fileInputRef.value = '';
		}
	}

	function removeEntry(index: number) {
		entries = entries.filter((_, i) => i !== index);
	}

	function addEntry() {
		entries = [...entries, { tanggal: '', keterangan: '', debet: 0, kredit: 0 }];
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('id-ID').format(value);
	}
</script>

<svelte:head>
	<title>Otomatisasi Laporan Kas RW</title>
</svelte:head>

<!-- Toast -->
{#if toast}
	<div
		class="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-3 rounded-lg px-4 py-3 shadow-lg {toast.type ===
		'success'
			? 'bg-emerald-600 text-white'
			: 'bg-red-600 text-white'}"
	>
		<span class="text-lg">{toast.type === 'success' ? '✓' : '✕'}</span>
		<p class="text-sm font-medium">{toast.message}</p>
		<button onclick={() => (toast = null)} class="ml-auto text-white/80 hover:text-white">✕</button>
	</div>
{/if}

<div class="mx-auto min-h-screen max-w-4xl bg-gray-50 px-4 py-8">
	<!-- Header -->
	<header class="mb-8 text-center">
		<h1 class="text-3xl font-bold text-gray-900">Otomatisasi Laporan Kas RW</h1>
		<p class="mt-2 text-gray-500">
			Upload foto laporan, ekstrak data otomatis, simpan ke Google Sheets.
		</p>
	</header>

	<!-- Step 1: Upload -->
	{#if entries.length === 0}
		<div class="rounded-xl bg-white p-6 shadow-sm">
			<div class="mb-4 flex items-center gap-2">
				<span
					class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
					>1</span
				>
				<h2 class="text-lg font-semibold text-gray-800">Upload Foto Laporan</h2>
			</div>

			<form
				method="POST"
				action="?/extract"
				enctype="multipart/form-data"
				use:enhance={async ({ formData, cancel }) => {
					if (!selectedFile) {
						cancel();
						return;
					}

					isCompressing = true;
					try {
						const compressed = await compressImage(selectedFile);
						formData.set('image', compressed);
					} catch {
						showToast('Gagal mengompresi gambar.', 'error');
						isCompressing = false;
						cancel();
						return;
					}
					isCompressing = false;
					isExtracting = true;

					return async ({ result }) => {
						isExtracting = false;
						if (result.type === 'failure') {
							showToast((result.data as { error: string })?.error ?? 'Gagal mengekstrak.', 'error');
						} else if (result.type === 'success') {
							const data = result.data as { entries: KasEntry[] };
							entries = data.entries;
							showToast(`Berhasil mengekstrak ${entries.length} baris data.`, 'success');
						}
					};
				}}
			>
				<!-- Drop Zone -->
				<div
					role="button"
					tabindex="0"
					ondrop={handleDrop}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					onclick={() => fileInputRef?.click()}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') fileInputRef?.click();
					}}
					class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors {dragOver
						? 'border-blue-500 bg-blue-50'
						: 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}"
				>
					<svg
						class="mb-3 h-12 w-12 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>

					{#if selectedFile}
						<p class="font-medium text-blue-600">{selectedFile.name}</p>
						<p class="mt-1 text-sm text-gray-400">
							{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
						</p>
					{:else}
						<p class="font-medium text-gray-600">
							Seret & lepas gambar di sini, atau klik untuk memilih
						</p>
						<p class="mt-1 text-sm text-gray-400">JPG, PNG, WebP (Maks. 10MB)</p>
					{/if}
				</div>

				<input
					bind:this={fileInputRef}
					type="file"
					name="image"
					accept="image/jpeg,image/png,image/webp"
					class="hidden"
					onchange={handleFileChange}
				/>

				{#if selectedFile}
					<div class="mt-4 flex gap-3">
						<button
							type="submit"
							disabled={isCompressing || isExtracting}
							class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{#if isCompressing}
								<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									></path>
								</svg>
								Mengompresi gambar...
							{:else if isExtracting}
								<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									></path>
								</svg>
								Mengekstrak data...
							{:else}
								Ekstrak Data
							{/if}
						</button>
						<button
							type="button"
							onclick={removeFile}
							class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
						>
							Hapus
						</button>
					</div>
				{/if}
			</form>
		</div>
	{/if}

	<!-- Step 2: Preview Table -->
	{#if entries.length > 0}
		<div class="rounded-xl bg-white p-6 shadow-sm">
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span
						class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white"
						>2</span
					>
					<h2 class="text-lg font-semibold text-gray-800">Pratinjau Data</h2>
					<span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
						>{entries.length} baris</span
					>
				</div>
				<button
					type="button"
					onclick={addEntry}
					class="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-blue-400 hover:text-blue-600"
				>
					+ Tambah Baris
				</button>
			</div>

			<p class="mb-4 text-sm text-gray-500">
				Periksa dan edit data di bawah sebelum menyimpan. Klik pada sel untuk mengedit.
			</p>

			<div class="overflow-x-auto rounded-lg border border-gray-200">
				<table class="w-full text-sm">
					<thead>
						<tr
							class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
						>
							<th class="px-4 py-3">Tanggal</th>
							<th class="px-4 py-3">Keterangan</th>
							<th class="px-4 py-3 text-right">Debet</th>
							<th class="px-4 py-3 text-right">Kredit</th>
							<th class="w-12 px-4 py-3"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100">
						{#each entries as entry, i (i)}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-4 py-2">
									<input
										type="text"
										bind:value={entry.tanggal}
										class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
										placeholder="dd/mm/yyyy"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="text"
										bind:value={entry.keterangan}
										class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
										placeholder="Keterangan"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={entry.debet}
										class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
										min="0"
									/>
								</td>
								<td class="px-4 py-2">
									<input
										type="number"
										bind:value={entry.kredit}
										class="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-blue-400 focus:bg-white focus:outline-none"
										min="0"
									/>
								</td>
								<td class="px-4 py-2 text-center">
									<button
										type="button"
										onclick={() => removeEntry(i)}
										class="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
										title="Hapus baris"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-gray-50 font-semibold text-gray-700">
							<td class="px-4 py-3" colspan="2">Total</td>
							<td class="px-4 py-3 text-right">
								{formatCurrency(entries.reduce((sum, e) => sum + (e.debet || 0), 0))}
							</td>
							<td class="px-4 py-3 text-right">
								{formatCurrency(entries.reduce((sum, e) => sum + (e.kredit || 0), 0))}
							</td>
							<td></td>
						</tr>
					</tfoot>
				</table>
			</div>

			<!-- Actions -->
			<div class="mt-6 flex gap-3">
				<form
					method="POST"
					action="?/sheets"
					class="flex-1"
					use:enhance={() => {
						isSaving = true;
						return async ({ result }) => {
							isSaving = false;
							if (result.type === 'failure') {
								showToast((result.data as { error: string })?.error ?? 'Gagal menyimpan.', 'error');
							} else if (result.type === 'success') {
								const count = (result.data as { count: number })?.count ?? 0;
								showToast(`${count} baris data berhasil disimpan ke Google Sheets!`, 'success');
								entries = [];
							}
						};
					}}
				>
					<input type="hidden" name="entries" value={JSON.stringify(entries)} />
					<div class="mb-4">
						<label for="month-select" class="block text-sm font-medium text-gray-700 mb-1"
							>Bulan Laporan:</label
						>
						<select
							id="month-select"
							name="month"
							bind:value={selectedMonth}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white border px-3 py-2"
						>
							{#each monthNames as m}
								<option value={m}>{m}</option>
							{/each}
						</select>
					</div>
					<button
						type="submit"
						disabled={isSaving}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{#if isSaving}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								></path>
							</svg>
							Menyimpan...
						{:else}
							Simpan ke Google Sheets
						{/if}
					</button>
				</form>
				<button
					type="button"
					onclick={() => (entries = [])}
					class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
				>
					Batal
				</button>
			</div>
		</div>
	{/if}
</div>
