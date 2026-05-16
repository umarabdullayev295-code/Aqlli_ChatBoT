# 🤖 Aqlli ChatBot - AI Yordamchi

O'zbek tilidagi zamonaviy AI chatbot dasturi. GPT-4o modeli bilan ishlaydi.

## 🚀 Ishga tushirish

### Eng oson usul
`start.bat` faylini ikki marta bosing — dastur avtomatik o'rnatiladi va brauzerda ochiladi.

### Qo'lda o'rnatish

```bash
# 1. Kutubxonalarni o'rnatish
pip install -r requirements.txt

# 2. .env faylini yaratish
copy .env.example .env

# 3. Dasturni ishga tushirish
python app.py
```

Keyin brauzerda: **http://localhost:5000**

## 🔑 OpenAI API kaliti (ixtiyoriy)

Demo rejimda ham ishlaydi. To'liq AI uchun:

1. [OpenAI](https://platform.openai.com/api-keys) saytiga kiring
2. API kalit yarating
3. `.env` faylini oching va kiriting:
   ```
   OPENAI_API_KEY=sk-...
   ```
4. Dasturni qayta ishga tushiring

## ✨ Imkoniyatlar

- 💬 Tabiiy suhbat (O'zbek va boshqa tillarda)
- 📚 Bilim va ma'lumot berish
- 💻 Dasturlash bo'yicha yordam
- ✍️ Matn yozish va tahrirlash
- 🌐 Tarjima
- 📝 Suhbatlar tarixi saqlash
- 🌙 Qorong'u / Yorug' tema
- 📋 Kod va matnni nusxalash

## 📁 Fayl tuzilmasi

```
Aqlli ChatBot/
├── app.py           ← Asosiy dastur (Flask server)
├── start.bat        ← Ishga tushirish skripti
├── requirements.txt ← Kutubxonalar ro'yxati
├── .env             ← API kalit (o'zingiz yaratasiz)
├── templates/
│   └── index.html   ← Asosiy sahifa
├── static/
│   ├── css/style.css
│   └── js/app.js
└── data/            ← Suhbatlar saqlanadigan joy
```

## 🛠️ Texnologiyalar

- **Backend:** Python, Flask
- **AI:** OpenAI GPT-4o
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Markdown:** marked.js
- **Kod ranglanishi:** highlight.js
