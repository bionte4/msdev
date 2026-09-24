# User Guide — Outsourcing Governance Portal

Panduan operasional untuk pengguna portal Managed Service & IT Staff Augmentation Governance.

Aplikasi dijalankan lokal: [http://localhost:3000](http://localhost:3000)

---

## 1. Mulai cepat

### 1.1 Login

1. Buka `/login`.
2. Masukkan email & password, atau pakai tombol **quick login** demo.
3. Setelah login, Anda diarahkan ke home sesuai role:
   - **DEVELOPER** → Timesheets
   - Role lain → Capacity

### 1.2 Akun demo (seed)

| Email | Role | Password |
| --- | --- | --- |
| `admin@acme.example` | SYS_ADMIN | `password123` |
| `pm@acme.example` | CLIENT_PM | `password123` |
| `lead@acme.example` | VENDOR_LEAD | `password123` |
| `am@acme.example` | VENDOR_AM | `password123` |
| `developer@acme.example` | DEVELOPER | `password123` |
| `dev2@acme.example` | DEVELOPER | `password123` |

### 1.3 Navigasi & notifikasi

- **Sidebar kiri** menampilkan menu sesuai role (menu yang tidak diizinkan tidak muncul).
- Membuka URL menu terlarang akan di-redirect ke home role Anda.
- **Loneng notifikasi** (header / mobile bar) menampilkan event penting (mis. pengajuan & review cuti). Klik item untuk membuka halaman terkait.
- **Sign out** ada di bawah profil sidebar (dan ikon logout di mobile).

---

## 2. Peran (role) & apa yang bisa dilakukan

| Role | Siapa | Fokus kerja |
| --- | --- | --- |
| **SYS_ADMIN** | Admin sistem | Semua client, konfigurasi, user access, integrasi |
| **CLIENT_PM** | Project Manager sisi client | Evaluasi, approve OT, review cuti, project, scope swap. Jika client **BODY_SHOPPING**, merangkap capability Vendor Lead + AM |
| **VENDOR_LEAD** | Lead vendor | Roster, timesheet team, coverage, development, access |
| **VENDOR_AM** | Account Manager vendor | Operasional roster/coverage/training; banyak modul view-only |
| **DEVELOPER** | Developer onsite/augmented | Data diri: timesheet, OT, cuti, skill, Jira link |

**Engagement mode (per client, di menu Clients — Admin)**

| Mode | Efek |
| --- | --- |
| **Managed service** | SoD ketat: PM client ≠ operasional vendor |
| **Body shopping** | Akun `CLIENT_PM` mendapat menu & CRUD gabungan Lead + AM (personnel, timesheet team, coverage, user access, dll.) |

Demo seed: **ACME = Body shopping** → login `pm@acme.example` sudah dual-hat.

**Scope data**

- Admin melihat lintas client.
- CLIENT_PM / VENDOR_LEAD / VENDOR_AM terbatas pada **client** yang terhubung ke akun.
- DEVELOPER terbatas pada **diri sendiri** (`developerId`).

Detail matrix menu ada di [README.md](./README.md#rbac).

---

## 3. Panduan per modul

### 3.1 Capacity (`/capacity`)

**Siapa:** Admin, Client PM, Vendor Lead, Vendor AM

Menampilkan utilisasi jam kerja developer per minggu (logged vs capacity standar).

- Pantau status beban (warning 45h / hard cap 50h).
- Cocok dipakai pagi standup / weekly governance.

### 3.2 Clients (`/clients`)

**Siapa:** Admin (CRUD), PM / Lead / AM (lihat client sendiri)

- **SYS_ADMIN** menambah / mengedit / menonaktifkan organisasi client.
- Field **Engagement mode**:
  - *Managed service* — segregasi PM vs vendor.
  - *Body shopping* — PM client merangkap Lead + AM.
- Role lain hanya melihat tenant yang relevan.

### 3.3 Projects (`/projects`)

**Siapa:** semua role (lihat); CRUD oleh Admin, Client PM, Vendor Lead

- Proyek dipakai sebagai target **timesheet** dan **scope swap**.
- DEVELOPER & Vendor AM: read-only daftar proyek client.

**Cara menambah proyek (PM / Lead / Admin)**

1. Buka Projects → isi nama, kode, client (Admin bisa pilih client).
2. Simpan. Pastikan status aktif untuk dipakai di form lain.

### 3.4 Personnel (`/personnel`)

**Siapa:** semua role (dengan batasan)

Ada dua bagian: **roster developer** dan **leave (cuti/sakit/unpaid)**.

#### Roster

| Aksi | Siapa |
| --- | --- |
| Tambah / edit / nonaktifkan personil | Admin, Vendor Lead, Vendor AM |
| Lihat roster | Client PM (+ role di atas) |
| Lihat & kelola profil sendiri | Developer |
| Link / unlink akun Jira | Developer (sendiri); Lead/AM/Admin/PM sesuai permission. Link **memverifikasi email ke Jira API** dan menyimpan `accountId`. Wajib: Integrations → Jira enabled + Test sukses. |

#### Leave

| Aksi | Siapa |
| --- | --- |
| Ajukan cuti | Developer (diri sendiri); Lead / Admin (bisa pilih developer) |
| Approve / reject | Client PM, Vendor Lead, Admin |
| Lihat daftar | Semua role di menu Personnel (scope sesuai role) |

**Alur cuti tipikal**

1. Developer mengajukan leave (tipe, tanggal, alasan).
2. Reviewer mendapat notifikasi loneng.
3. PM / Lead / Admin approve atau reject.
4. Setelah approved, Vendor dapat menugaskan **Coverage**.

### 3.5 Coverage (`/coverage`)

**Siapa:** CRUD oleh Admin, PM, Lead, AM · Developer hanya melihat assignment yang melibatkan dirinya

Menugaskan **cover developer** menggantikan yang absen (cuti/sakit).

1. Pilih project, absent developer, cover developer, tanggal, alasan.
2. Opsional hubungkan ke leave request yang pending/approved.
3. Status: PLANNED → ACTIVE → COMPLETED / CANCELLED.

### 3.6 Development (`/development`)

**Siapa:** semua role (isi berbeda)

| Tab / area | Siapa yang mengelola |
| --- | --- |
| Katalog skill / kategori | Vendor Lead, Vendor AM, Admin (CRUD penuh) |
| Assign skill ke developer | Lead, AM, Developer (hanya diri sendiri) |
| Training schedule | Lead, AM |
| Coaching | Lead, AM |
| Reward / Punishment | Lead, Client PM, Admin |

Gunakan untuk tracking kompetensi, jadwal training (tanggal, lokasi, jam), dan tindakan kinerja yang masuk leaderboard.

### 3.7 Timesheets (`/timesheets`)

**Siapa:** semua role · **mutasi** hanya Developer, Vendor Lead, Admin

Aturan keras:

- Maks **16 jam / hari**
- Peringatan **45 jam / minggu**
- Hard cap **50 jam / minggu**

**Developer**

1. Filter periode jika perlu.
2. Tambah entri: tanggal, project, jam, deskripsi, flag OT bila relevan.
3. Edit / hapus hanya entri milik sendiri.
4. Bisa **download template** & **import Excel** (bulk).

**Vendor Lead / Admin**

- CRUD untuk tim; bisa pilih developer saat create.
- Import Excel untuk tim.

**Client PM / Vendor AM**

- Read-only pantauan jam team.

### 3.8 Overtime (`/overtime`)

Alur: `PENDING` → `APPROVED_CLIENT` / `REJECTED_CLIENT`

| Aksi | Siapa |
| --- | --- |
| Ajukan OT | Developer (profil developer wajib ter-link); Lead/Admin jika punya developer profile |
| Approve / reject | Client PM, Admin |
| Lihat daftar | Semua role dengan akses menu (scope sesuai role) |

Setelah OT disetujui client, jam OT boleh dicatat selaras kebijakan timesheet.

### 3.9 Evaluations (`/evaluations`)

**Submit:** Client PM, Admin · **View:** juga Vendor Lead & Vendor AM

Bobot skor:

| Aspek | Bobot |
| --- | --- |
| Code quality | 30% |
| Delivery | 25% |
| Technical | 20% |
| Communication | 15% |
| Professionalism | 10% |

**Total = Σ (skor × bobot).**  
Jika total **&lt; 2.80** → sistem membuat **replacement ticket** (SLA target **10 hari kerja**).

### 3.10 Leaderboard (`/leaderboard`)

**Siapa:** semua role dengan menu

Peringkat developer (dalam scope client) berdasarkan:

- Skor evaluasi bulanan
- Poin reward / punishment
- Jam kerja

Developer melihat ranking yang sama (kompetisi terbuka dalam tenant).

### 3.11 Scope swaps (`/scope-swaps`)

**Buat:** Client PM, Vendor Lead, Admin · **View:** juga Vendor AM

Protokol **1-in / 1-out**: story points dan hours masuk ≈ keluar (toleransi ketat).

1. Pilih project, developer keluar, developer masuk.
2. Isi SP & hours out/in yang setara.
3. Simpan; status tercatat di list.

### 3.12 Reports (`/reports`)

**Siapa:** semua role dengan menu

- Pilih jenis laporan + rentang tanggal.
- **Export Excel (.xlsx)**.
- Developer: data dibatasi ke diri sendiri.
- Role lain: data client (Admin: lintas client sesuai filter).

### 3.13 User access (`/access`)

**Siapa:** SYS_ADMIN, VENDOR_LEAD

- Buat / ubah user: role, client, aktif/nonaktif.
- User nonaktif **tidak bisa login**.
- Gunakan untuk offboarding atau koreksi role.

### 3.14 Integrations (`/integrations`)

**Siapa:** SYS_ADMIN (edit), VENDOR_LEAD (lihat)

Kartu konfigurasi:

- Email / SMTP (notifikasi)
- **Jira** — test live ke `/myself` + project; dipakai verifikasi email personil
- ServiceNow

Admin dapat menguji koneksi dan menyimpan config; secret disembunyikan untuk non-admin.

**Alur verify Jira personil**

1. Admin isi Integrations → Jira (base URL, email service account, API token, project key) → **Test** sampai SUCCESS.
2. Di Personnel, isi / link email Jira developer.
3. Portal memanggil Jira user search; jika ketemu, status **Verified** + `accountId` tersimpan.
4. Tanpa config Jira (atau test gagal), link ditolak dengan pesan error yang jelas.

---

## 4. Alur kerja umum (end-to-end)

### 4.1 Onboarding developer baru

1. **Vendor Lead / AM** buat personil di Personnel (akun + kapasitas + rate).
2. Pastikan masuk **Project** yang benar (timesheet target).
3. Developer login → link **Jira** di Personnel (profil sendiri).
4. Developer isi skill di **Development**.

### 4.2 Kerja harian developer

1. Isi **Timesheet** setiap hari (≤ 16h).
2. Jika perlu lembur → ajukan **Overtime** dulu, tunggu approve PM.
3. Jika cuti → ajukan **Leave** di Personnel; pantau notifikasi.

### 4.3 Cuti + pengganti

1. Leave diajukan → reviewer approve.
2. **Coverage** dibuat (cover developer + tanggal).
3. Cover developer catat timesheet di project yang sama sesuai kesepakatan.

### 4.4 Evaluasi bulanan & SLA

1. **Client PM** isi scorecard di Evaluations.
2. Jika skor &lt; 2.80 → replacement ticket muncul.
3. Vendor Lead koordinasi penggantian dalam **10 hari kerja**.
4. Bila perlu tukar scope tanpa ganti orang penuh → **Scope swap** (SP/hours setara).

### 4.5 Governance mingguan

1. **Capacity** — siapa over/under capacity.
2. **Reports** — export untuk meeting.
3. **Leaderboard** — pantau performa & reward.

---

## 5. Tips & troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| Menu tidak muncul | Role tidak punya akses | Wajar — cek matrix RBAC / minta Lead ubah role di Access |
| Redirect ke home | URL menu terlarang | Login dengan role yang benar |
| Tidak bisa submit OT | Akun tanpa profil developer | Link/buat Developer record di Personnel |
| Timesheet ditolak | Melewati 16h/hari atau 50h/minggu | Kurangi jam / pecah ke hari lain |
| Form evaluasi kosong (Lead/AM) | View-only | Hanya Client PM / Admin yang submit |
| Form scope swap kosong (AM) | View-only | Minta PM atau Lead membuat swap |
| Login gagal | User nonaktif / password salah | Cek Access admin; password demo `password123` |
| Data “kosong” lintas client | Scope tenant | Admin lihat semua; role lain hanya client sendiri |

---

## 5.1 Keamanan singkat

- Jangan bagikan password demo di lingkungan non-local.
- Nonaktifkan user yang sudah offboard via **User access**.
- Developer tidak bisa mengubah data developer lain (dicek di server action).

---

## 6. Referensi teknis

- Setup & stack: [README.md](./README.md)
- Definisi route roles: `src/lib/rbac-routes.ts`
- Page guard: `src/lib/require-route-role.ts`

---

*Dokumen ini mengikuti perilaku aplikasi saat rilis RBAC route guards. Jika menu atau permission berubah, sync ulang bagian matrix dengan README.*
