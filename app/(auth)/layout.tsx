export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="top auth-top gutter"><div className="inner wide">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo.png" alt="TodayOnline" width="660" height="132" />
      </div></header>
      <div className="gutter"><div className="login">{children}</div></div>
    </>
  );
}
