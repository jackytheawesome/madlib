import Link from "next/link";

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="m24 2 5.2 14.8L44 12l-9.2 12L44 36l-14.8-4.8L24 46l-5.2-14.8L4 36l9.2-12L4 12l14.8 4.8L24 2Z" fill="currentColor" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="catalog-shell">
      <a className="catalog-skip" href="#games">Перейти к играм</a>
      <header className="catalog-header">
        <Link href="/" className="catalog-logo" aria-label="Chepuha.fun — главная">
          <span className="catalog-logo-icon" aria-hidden="true">✳</span>
          <span>chepuha<span className="catalog-logo-suffix">.fun</span></span>
        </Link>
        <a href="#games" className="catalog-nav">Выбрать игру <Arrow /></a>
      </header>

      <main className="catalog-main">
        <section className="catalog-intro" aria-labelledby="catalog-title">
          <p className="catalog-eyebrow"><span aria-hidden="true" /> Игры для хорошей компании</p>
          <h1 id="catalog-title">Собрались?<br /><span>Поиграем.</span><Spark className="catalog-hero-spark" /></h1>
          <p className="catalog-lead">Зовите друзей и выбирайте игру.<br className="catalog-desktop-break" /> Всё прямо в браузере — без скачивания и регистрации.</p>
        </section>

        <section id="games" className="catalog-games" aria-labelledby="games-title">
          <div className="catalog-section-heading">
            <h2 id="games-title">Во что играем?</h2>
            <span>Коллекция растёт</span>
          </div>
          <div className="catalog-grid">
            <Link href="/chepuha" className="catalog-card catalog-card-playable" aria-labelledby="chepuha-card-title" aria-describedby="chepuha-card-description">
              <div className="catalog-card-art catalog-art-chepuha" aria-hidden="true">
                <span className="catalog-art-label">Слова ваши. История — сюрприз.</span>
                <div className="catalog-story-sheet">
                  <span className="catalog-sheet-number">01 / Чепуха</span>
                  <p>Однажды <span className="catalog-word catalog-word-green">капибара</span><br />открыла кафе<br />на <span className="catalog-word catalog-word-orange">Луне.</span></p>
                  <span className="catalog-sheet-line" />
                  <span className="catalog-sheet-line catalog-sheet-line-short" />
                </div>
                <span className="catalog-dice">⚄</span>
                <Spark className="catalog-art-spark" />
              </div>
              <div className="catalog-card-content">
                <div className="catalog-card-topline"><span>Игра со словами</span><span className="catalog-status"><span /> Можно играть</span></div>
                <h3 id="chepuha-card-title">Чепуха</h3>
                <p id="chepuha-card-description">Заполните пропуски вслепую, а потом прочитайте получившуюся историю. Чем неожиданнее слова, тем смешнее.</p>
                <div className="catalog-card-bottom"><span className="catalog-player-count">1–4 игрока</span><span className="catalog-play">Играть <Arrow /></span></div>
              </div>
            </Link>

            <article className="catalog-card catalog-card-soon" aria-labelledby="next-game-title">
              <div className="catalog-card-art catalog-art-soon" aria-hidden="true">
                <span className="catalog-art-label">Следующая история ещё впереди</span>
                <div className="catalog-question-card"><span>?</span><span className="catalog-question-lines"><i /><i /><i /></span></div>
                <span className="catalog-orbit catalog-orbit-one" />
                <span className="catalog-orbit catalog-orbit-two" />
                <Spark className="catalog-soon-spark" />
              </div>
              <div className="catalog-card-content">
                <div className="catalog-card-topline"><span>Пополнение коллекции</span><span className="catalog-status catalog-status-soon">Скоро</span></div>
                <h3 id="next-game-title">Новая игра</h3>
                <p>Здесь появится ещё один повод собраться вместе. А пока можно сыграть в «Чепуху».</p>
                <div className="catalog-card-bottom"><span className="catalog-player-count">Ещё немного терпения</span><span className="catalog-soon-label">Готовим <span aria-hidden="true">✳</span></span></div>
              </div>
            </article>
          </div>
        </section>

        <div className="catalog-footnote">
          <span className="catalog-footnote-mark" aria-hidden="true">↗</span>
          <p>Одна ссылка — вся компания.<span> Создайте комнату в игре и отправьте приглашение друзьям.</span></p>
        </div>
      </main>
      <footer className="catalog-footer"><span>chepuha.fun</span><span>Главное — с кем играть.</span></footer>
    </div>
  );
}
