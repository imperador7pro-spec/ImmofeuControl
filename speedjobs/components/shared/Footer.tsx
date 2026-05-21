export function Footer() {
  return (
    <footer className="bg-white border-t py-6 mt-12">
      <div className="max-w-2xl mx-auto px-4 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} SpeedJob&apos;s · Emplois d&apos;urgence en temps réel
      </div>
    </footer>
  );
}
