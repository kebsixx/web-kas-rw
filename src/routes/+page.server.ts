import { fail } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import { GEMINI_API_KEY, GOOGLE_SERVICE_ACCOUNT, GOOGLE_SPREADSHEET_ID } from '$env/static/private';
import type { KasEntry } from '$lib/types.js';
import type { Actions } from './$types.js';

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function getAuthClient() {
	const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
	return new google.auth.GoogleAuth({
		credentials,
		scopes: ['https://www.googleapis.com/auth/spreadsheets']
	});
}

function getMonthSheetName(dateStr: string): string {
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
			return m.name;
		}
	}

	const parts = dateStr.split(/[-/]/);
	if (parts.length >= 2) {
		const mm = parseInt(parts[1], 10);
		if (mm >= 1 && mm <= 12) {
			return months[mm - 1].name;
		}
		const mm2 = parseInt(parts[0], 10);
		if (mm2 >= 1 && mm2 <= 12 && parts[0].length <= 2) {
			return months[mm2 - 1].name;
		}
	}

	const currentMonthIndex = new Date().getMonth();
	return months[currentMonthIndex].name;
}

export const actions: Actions = {
	extract: async ({ request }) => {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Tidak ada gambar yang diunggah.' });
		}

		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			return fail(400, { error: 'Format file tidak didukung. Gunakan JPG, PNG, atau WebP.' });
		}

		if (file.size > 10 * 1024 * 1024) {
			return fail(400, { error: 'Ukuran file terlalu besar. Maksimal 10MB.' });
		}

		try {
			const buffer = await file.arrayBuffer();
			const base64 = Buffer.from(buffer).toString('base64');

			const response = await genai.models.generateContent({
				model: 'gemini-2.5-flash',
				contents: [
					{
						role: 'user',
						parts: [
							{
								inlineData: {
									mimeType: file.type,
									data: base64
								}
							},
							{
								text: "Ekstrak data dari foto dokumen laporan keuangan kas ini menjadi JSON array berstruktur dengan key: 'tanggal' (string), 'keterangan' (string), 'debet' (number murni), 'kredit' (number murni). Abaikan header tabel, judul, dan kolom saldo. Jangan kembalikan markdown, HANYA JSON MURNI."
							}
						]
					}
				]
			});

			const text = response.text?.trim() ?? '';

			// Strip markdown code fences if present
			const jsonString = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

			const entries: KasEntry[] = JSON.parse(jsonString);

			if (!Array.isArray(entries)) {
				return fail(422, { error: 'AI tidak mengembalikan format array yang valid.' });
			}

			// Normalize entries
			const cleaned: KasEntry[] = entries.map((e) => ({
				tanggal: String(e.tanggal ?? ''),
				keterangan: String(e.keterangan ?? ''),
				debet: Number(e.debet) || 0,
				kredit: Number(e.kredit) || 0
			}));

			return { entries: cleaned };
		} catch (err) {
			console.error('Extract error:', err);
			const message = err instanceof Error ? err.message : 'Gagal mengekstrak data dari gambar.';
			return fail(500, { error: message });
		}
	},

	sheets: async ({ request }) => {
		const formData = await request.formData();
		const raw = formData.get('entries') as string | null;
		const selectedMonth = formData.get('month') as string | null;

		if (!raw) {
			return fail(400, { error: 'Data kosong.' });
		}

		let entries: KasEntry[];
		try {
			entries = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'Format data tidak valid.' });
		}

		if (!Array.isArray(entries) || entries.length === 0) {
			return fail(400, { error: 'Tidak ada data untuk disimpan.' });
		}

		try {
			const auth = getAuthClient();
			const sheets = google.sheets({ version: 'v4', auth });
			const spreadsheetId = GOOGLE_SPREADSHEET_ID;

			// 1. Determine target sheet name
			const targetSheetName = selectedMonth || getMonthSheetName(entries[0].tanggal || '');

			// 2. Check if the sheet exists
			const meta = await sheets.spreadsheets.get({ spreadsheetId });
			let sheet = meta.data.sheets?.find((s) => s.properties?.title === targetSheetName);
			let sheetId = sheet?.properties?.sheetId;

			// 3. Create sheet & structure UI if it doesn't exist
			if (!sheetId) {
				const addSheetRes = await sheets.spreadsheets.batchUpdate({
					spreadsheetId,
					requestBody: {
						requests: [
							{
								addSheet: {
									properties: { title: targetSheetName }
								}
							}
						]
					}
				});
				sheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId;

				if (!sheetId) {
					throw new Error('Gagal membuat worksheet baru.');
				}

				// Style title, headers, format, and borders for the new sheet
				await sheets.spreadsheets.batchUpdate({
					spreadsheetId,
					requestBody: {
						requests: [
							{
								mergeCells: {
									range: {
										sheetId,
										startRowIndex: 0,
										endRowIndex: 1,
										startColumnIndex: 0,
										endColumnIndex: 6
									},
									mergeType: 'MERGE_ALL'
								}
							},
							{
								updateCells: {
									rows: [
										{
											values: [
												{
													userEnteredValue: {
														stringValue: `Laporan Keuangan Kas Setoran dari RT di kemasan RW 01 ( Bulan ${targetSheetName} )`
													},
													userEnteredFormat: {
														textFormat: { bold: true, fontSize: 12 },
														horizontalAlignment: 'CENTER'
													}
												}
											]
										}
									],
									fields: 'userEnteredValue,userEnteredFormat',
									range: {
										sheetId,
										startRowIndex: 0,
										endRowIndex: 1,
										startColumnIndex: 0,
										endColumnIndex: 1
									}
								}
							},
							{
								updateCells: {
									rows: [
										{
											values: ['No', 'Tanggal', 'Keterangan', 'Debet', 'Kredit', 'Saldo'].map(
												(val) => ({
													userEnteredValue: { stringValue: val },
													userEnteredFormat: {
														textFormat: { bold: true },
														horizontalAlignment: 'CENTER',
														backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
													}
												})
											)
										}
									],
									fields: 'userEnteredValue,userEnteredFormat',
									range: {
										sheetId,
										startRowIndex: 2,
										endRowIndex: 3,
										startColumnIndex: 0,
										endColumnIndex: 6
									}
								}
							},
							{
								updateBorders: {
									range: {
										sheetId,
										startRowIndex: 2,
										endRowIndex: 3,
										startColumnIndex: 0,
										endColumnIndex: 6
									},
									top: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
									bottom: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
									left: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
									right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } }
								}
							}
						]
					}
				});
			}

			// 4. Get current last row
			const existing = await sheets.spreadsheets.values.get({
				spreadsheetId,
				range: `${targetSheetName}!A:F`
			});

			const originalValues = existing.data.values;
			let lastRow = originalValues?.length ?? 3;
			if (lastRow < 3) {
				lastRow = 3;
			}

			// If the last row is the "Total" row, overwrite it
			if (lastRow > 3 && originalValues?.[lastRow - 1]?.[2] === 'Total') {
				lastRow = lastRow - 1;
			}

			// 5. Build 2D array with data and saldo formula
			const values = entries.map((entry, i) => {
				const targetRow = lastRow + 1 + i;
				// First data row is row 4 (1-based index)
				const saldoFormula =
					targetRow === 4 ? `=D4-E4` : `=F${targetRow - 1}+D${targetRow}-E${targetRow}`;
				const rowNo = lastRow - 2 + i;

				return [rowNo, entry.tanggal, entry.keterangan, entry.debet, entry.kredit, saldoFormula];
			});

			// Append "Baris Total" at the end
			const N = lastRow + entries.length;
			const totalRow = ['', '', 'Total', `=SUM(D4:D${N})`, `=SUM(E4:E${N})`, `=F${N}`];
			values.push(totalRow);

			// Write new values
			await sheets.spreadsheets.values.update({
				spreadsheetId,
				range: `${targetSheetName}!A${lastRow + 1}`,
				valueInputOption: 'USER_ENTERED',
				requestBody: { values }
			});

			// Clean up trailing rows if the sheet used to be longer
			if (originalValues && originalValues.length > N + 1) {
				await sheets.spreadsheets.values.clear({
					spreadsheetId,
					range: `${targetSheetName}!A${N + 2}:F`
				});
			}

			// 6. Draw borders and apply formatting for the new range and total row
			await sheets.spreadsheets.batchUpdate({
				spreadsheetId,
				requestBody: {
					requests: [
						// Border entire table from header (Row 3, index 2) to Total row (Row N + 1, index N)
						{
							updateBorders: {
								range: {
									sheetId,
									startRowIndex: 2,
									endRowIndex: N + 1,
									startColumnIndex: 0,
									endColumnIndex: 6
								},
								top: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
								bottom: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
								left: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
								right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
								innerHorizontal: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
								innerVertical: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } }
							}
						},
						// Bold & style total row (index N)
						{
							repeatCell: {
								range: {
									sheetId,
									startRowIndex: N,
									endRowIndex: N + 1,
									startColumnIndex: 0,
									endColumnIndex: 6
								},
								cell: {
									userEnteredFormat: {
										textFormat: { bold: true },
										backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }
									}
								},
								fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor'
							}
						},
						// NumberFormat with type CURRENCY and pattern "Rp"#,##0 for columns D, E, F
						{
							repeatCell: {
								range: {
									sheetId,
									startRowIndex: 3, // starting from Row 4 (index 3)
									endRowIndex: N + 1, // up to and including Total row (index N)
									startColumnIndex: 3,
									endColumnIndex: 6
								},
								cell: {
									userEnteredFormat: {
										numberFormat: {
											type: 'CURRENCY',
											pattern: '"Rp"#,##0'
										}
									}
								},
								fields: 'userEnteredFormat.numberFormat'
							}
						}
					]
				}
			});

			return { success: true, count: entries.length };
		} catch (err) {
			console.error('Sheets error:', err);
			const message = err instanceof Error ? err.message : 'Gagal menyimpan data ke Google Sheets.';
			return fail(500, { error: message });
		}
	}
};
