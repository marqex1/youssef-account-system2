Youssef Accounts System V21 Stable

بيانات الدخول الافتراضية:
Admin:
Username: Admin Joo
Password: 01032869945

Pro:
Username: Joo
Password: 01032869945

طريقة الرفع على GitHub:
1) فك الضغط.
2) ارفع الملفات الموجودة داخل الفولدر مباشرة إلى الريبو، وليس الفولدر نفسه.
3) لازم index.html يكون في Root.
4) فعّل GitHub Pages من Settings > Pages.

Online Save:
- ملف cloud-config.js مضاف فيه بيانات Supabase التي أرسلتها.
- شغّل supabase_schema.sql مرة واحدة في Supabase SQL Editor.
- بعد فتح الموقع، الحفظ يتم Offline محليًا وOnline على Supabase.
- لو Supabase وقع، الموقع يشتغل Offline ويعمل مزامنة عند رجوع الاتصال.

مهم:
- لا ترفع Secret Key أبدًا.
- هذا النظام مناسب للتشغيل السريع. للأمان العالي جدًا، الأفضل استخدام Supabase Auth لاحقًا.
