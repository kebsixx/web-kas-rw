# Otomatisasi Laporan Kas RW

Aplikasi web modern berbasis SvelteKit untuk mengotomatisasi proses pencatatan laporan keuangan kas RT/RW. Upload foto laporan, ekstrak data menggunakan AI, dan simpan langsung ke Google Sheets.

## ✨ Fitur Utama

- 🤖 **Ekstraksi Data Otomatis**: Upload foto laporan kas dan biarkan AI (Google Gemini) mengekstrak data transaksi secara otomatis
- 🖼️ **Kompresi Gambar Client-Side**: Otomatis mengompresi gambar sebelum upload (max 1MB, resolusi Full HD) untuk menghemat bandwidth dan token AI
- 📊 **Integrasi Google Sheets**: Simpan data langsung ke Google Sheets dengan format rapi, border, dan formula otomatis
- 📅 **Organisasi per Bulan**: Data dikelompokkan otomatis ke sheet terpisah berdasarkan bulan laporan
- ✏️ **Edit Inline**: Periksa dan edit data hasil ekstraksi sebelum menyimpan
- 🎨 **Modern Dark UI**: Desain premium dark theme dengan Tailwind CSS
- 💾 **Auto-Format**: Format mata uang Rupiah, rumus saldo otomatis, dan baris total

## 🚀 Tech Stack

- **Frontend**: SvelteKit 5 (Runes), TypeScript, Tailwind CSS
- **AI**: Google Gemini 2.5 Flash (Vision + Structured Output)
- **Backend**: SvelteKit Server Actions, Google Sheets API v4
- **Image Processing**: browser-image-compression (client-side)

## 📋 Prasyarat

- Node.js 18+ dan npm
- Google Cloud Project dengan Gemini API dan Google Sheets API aktif
- Service Account Google dengan akses ke spreadsheet target

## 🔧 Instalasi

1. Clone repository:
```sh
git clone https://github.com/kebsixx/web-kas-rw.git
cd web-kas-rw
```

2. Install dependencies:
```sh
npm install
```

3. Buat file `.env` berdasarkan `.env.example`:
```env
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}
```

4. Jalankan development server:
```sh
npm run dev
```

5. Buka browser di `http://localhost:5173`

## 📖 Cara Penggunaan

1. **Upload Foto**: Klik atau drag-drop foto laporan kas ke area upload
2. **Kompresi & Ekstrak**: Gambar akan dikompres otomatis, lalu AI akan mengekstrak data transaksi
3. **Review Data**: Periksa tabel pratinjau, edit jika diperlukan, pilih bulan laporan
4. **Simpan**: Klik "Simpan ke Google Sheets" untuk menyimpan data

## 🏗️ Struktur Sheets

Setiap bulan memiliki sheet terpisah dengan struktur:
- **Baris 1**: Judul laporan (merged A1:F1, bold, center)
- **Baris 3**: Header tabel (No, Tanggal, Keterangan, Debet, Kredit, Saldo)
- **Baris 4+**: Data transaksi dengan formula saldo otomatis
- **Baris Terakhir**: Total Debet dan Kredit dengan formula SUM

## 🛠️ Build Production

```sh
npm run build
npm run preview
```

## 📝 License

MIT License - Copyright (c) 2026

## 👨‍💻 Author

**kebsixx** - [GitHub](https://github.com/kebsixx)

---

Built with ❤️ using SvelteKit & Google Gemini AI
