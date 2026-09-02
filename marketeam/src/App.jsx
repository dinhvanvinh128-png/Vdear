import { useEffect, useState } from 'react';

const ASSETS = 'https://polo-pecan-73837341.figma.site/_assets/v11';

const HEADING =
  'Unlock Top Marketing Talent You Thought Was Out of Reach — Now Just One Click Away!';
/*
 * Mốc 67 ký tự chia câu thành hai màu. Nó chỉ rơi đúng ranh giới từ khi dấu
 * gạch là EM DASH: "…Was Out of Reach — Now Just" | " One Click Away!".
 * Viết bằng hai dấu trừ "--" thì câu dài thêm một ký tự và mốc 67 cắt ngang
 * chữ "Just" thành "Jus|t".
 */
const SPLIT = 67;

const NAV = ['Your Team', 'Solutions', 'Blog', 'Pricing'];

/* Quỹ đạo: đường kính, chiều quay, chu kỳ. */
const ORBITS = [
  { id: 1, size: 353, dir: 'left', duration: 30 },
  { id: 2, size: 501, dir: 'right', duration: 40 },
  { id: 3, size: 649, dir: 'right', duration: 50 },
  { id: 4, size: 797, dir: 'left', duration: 60 },
];

/*
 * Avatar đặt trên quỹ đạo bằng công thức
 *   translate(-50%,-50%) rotate(A) translate(R) rotate(-A)
 * rotate cuối triệt tiêu góc nghiêng để ảnh đứng thẳng ngay khi vừa đặt.
 */
const AVATARS = [
  { file: 'aa51718fb3af3637e6d666b6543fc27a175fada6.png', orbit: 1, angle: 270, radius: 177, size: 58, shape: '20px', glow: 'purple', delay: 0.6 },
  { file: 'ca755f7f93c1126fb8bdbf99ab364a33aa9ab272.png', orbit: 2, angle: 60,  radius: 251, size: 58, shape: '50%',  glow: 'yellow', delay: 0.8 },
  { file: 'dc01064c7093dcc32674876ee3cf5e41c4a485c6.png', orbit: 2, angle: 180, radius: 251, size: 78, shape: '50%',  glow: 'pink',   delay: 1.0 },
  { file: 'd5470a58b02388336141575048720f19a50de832.png', orbit: 2, angle: 300, radius: 251, size: 58, shape: '20px', glow: 'blue',   delay: 1.2 },
  { file: '018736aa5d0275c4ce56cfebaf2ae3007d81ca1e.png', orbit: 3, angle: 130, radius: 325, size: 88, shape: '50%',  glow: 'pink',   delay: 1.4 },
  { file: 'c76d8a0b99676de31c014344bfaf75bad090758d.png', orbit: 4, angle: 30,  radius: 399, size: 58, shape: '50%',  glow: 'purple', delay: 1.7 },
  { file: '7b1b5f039de7b54cc9913e96c1923c3b15a157fa.png', orbit: 4, angle: 95,  radius: 399, size: 88, shape: '24px', glow: 'orange', delay: 1.9 },
  { file: '9ae171d8895199349755c43fbff00e122221a027.png', orbit: 4, angle: 220, radius: 399, size: 88, shape: '24px', glow: 'pink',   delay: 2.1 },
  { file: '926c9eb7b4bc1df846fa0e39f0b0dc3fefd80671.png', orbit: 4, angle: 320, radius: 399, size: 58, shape: '50%',  glow: 'purple', delay: 2.3 },
];

const TICKER_LOGOS = [
  '1e7b0e6fcc016cd28aec5c68990118b8c54c35a5.svg',
  '3eac03c183db2ae080d910159211c14843398b61.svg',
  '17705a4c0023a0e5a99154dfb10582adbbf4260b.svg',
  '0e5f442b09dc5c248e3e60d40a65505fb1887228.svg',
  '63f99030ceb459e3c9ab9e429cfa2353491d3816.svg',
];

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- hooks -- */

/*
 * Đếm 0 -> `to`, easeOutCubic. Tính theo MỐC THỜI GIAN THẬT chứ không cộng dồn
 * mỗi khung: máy tụt khung thì tổng thời lượng vẫn đúng 2 giây.
 */
function useCountUp(to, { duration = 2000, delay = 1200 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduceMotion()) { setValue(to); return undefined; }
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const step = (now) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [to, duration, delay]);

  return value;
}

/* ----------------------------------------------------------- components -- */

function TypewriterHeading({ text, split, speed = 35, delay = 400 }) {
  const [count, setCount] = useState(0);
  const done = count >= text.length;

  useEffect(() => {
    if (reduceMotion()) { setCount(text.length); return undefined; }
    let id = 0;
    const startTimer = setTimeout(() => {
      id = setInterval(() => {
        setCount((c) => {
          if (c >= text.length) { clearInterval(id); return c; }
          return c + 1;
        });
      }, speed);
    }, delay);
    return () => { clearTimeout(startTimer); clearInterval(id); };
  }, [text, speed, delay]);

  const shown = text.slice(0, count);

  return (
    <h1 className="hero-heading">
      {/* Câu đầy đủ cho trình đọc màn hình: nội dung không phụ thuộc hiệu ứng gõ. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        <span className="heading-dark">{shown.slice(0, split)}</span>
        <span className="heading-light">{shown.slice(split)}</span>
        {!done && <span className="type-cursor" />}
      </span>
    </h1>
  );
}

function ArrowIcon() {
  return (
    <svg className="btn-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M6.75 3.75 12 9l-5.25 5.25" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PointerIcon() {
  return (
    <svg className="pointer-icon" width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
      <path d="M2 1.5 19 12.2l-7.3 1.2L8.4 21 2 1.5Z" fill="#A068FF" />
    </svg>
  );
}

/* Nút bọc trong khung viền gradient xoay (conic-gradient + mask). */
function BorderWrap({ className = '', children }) {
  return <div className={`btn-border-wrap ${className}`.trim()}>{children}</div>;
}

function Circles() {
  const specialists = useCountUp(20, { duration: 2000, delay: 1200 });

  return (
    <div className="circles" aria-hidden="true">
      {ORBITS.map((o) => (
        <div
          key={o.id}
          className={`orbit orbit-${o.id} spin-${o.dir}`}
          style={{ '--size': `${o.size}px`, '--duration': `${o.duration}s` }}
        >
          {o.id === 1 && (
            <div className={`orbit-core spin-${o.dir === 'left' ? 'right' : 'left'}`}
                 style={{ '--duration': `${o.duration}s` }}>
              <span className="core-number">{specialists}k+</span>
              <span className="core-label">Specialists</span>
            </div>
          )}
          {AVATARS.filter((a) => a.orbit === o.id).map((a) => (
            <div
              key={a.file}
              className={`avatar glow-${a.glow}`}
              style={{
                '--angle': `${a.angle}deg`,
                '--radius': `${a.radius}px`,
                '--avatar-size': `${a.size}px`,
                '--avatar-shape': a.shape,
                '--delay': `${a.delay}s`,
              }}
            >
              {/* Quay ngược lại đúng chu kỳ quỹ đạo để mặt người luôn thẳng đứng. */}
              <div
                className={`avatar-inner spin-${o.dir === 'left' ? 'right' : 'left'}`}
                style={{ '--duration': `${o.duration}s` }}
              >
                <img src={`${ASSETS}/${a.file}`} alt="" loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LogoTicker() {
  // Lặp 4 lần để nối vòng liền mạch: track chạy đúng 25% bề rộng rồi trở về 0.
  const strip = Array.from({ length: 4 }).flatMap(() => TICKER_LOGOS);
  return (
    <div className="logos">
      <div className="logo-track">
        {strip.map((file, i) => (
          <img key={`${file}-${i}`} className="logo" src={`${ASSETS}/${file}`} alt="" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ app -- */

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <img
            className="logo-mark"
            src={`${ASSETS}/17ae538989a509947a8de3892c644664895e69b1.png`}
            alt="Marketeam"
          />
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <a key={item} className="nav-link" href="#">{item}</a>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <a className="login-link" href="#">Log In</a>
          <BorderWrap>
            <button type="button" className="btn btn-join">Join Now</button>
          </BorderWrap>
        </div>
      </header>

      <main className="hero">
        <div className="hero-left">
          <TypewriterHeading text={HEADING} split={SPLIT} speed={35} delay={400} />

          <BorderWrap className="start-wrap">
            <button type="button" className="btn btn-start">
              Start Project
              <ArrowIcon />
            </button>
          </BorderWrap>

          <div className="cursor-badge">
            <PointerIcon />
            <span className="cursor-name">David</span>
          </div>
        </div>

        <div className="hero-right">
          <Circles />
        </div>
      </main>

      <LogoTicker />
    </div>
  );
}
