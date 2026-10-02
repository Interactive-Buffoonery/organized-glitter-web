import { Link } from 'react-router-dom';

export function SarahSignature() {
  return (
    <section className="relative z-10 px-4 pt-10 pb-20 md:pt-14">
      <div className="container mx-auto max-w-3xl">
        <aside className="sig-panel paper-shadow">
          <span className="tape tape--lav sig-panel__tape sig-panel__tape--tl" aria-hidden />
          <span className="tape tape--peach sig-panel__tape sig-panel__tape--tr" aria-hidden />
          <div className="sig-avatar">
            <img
              src="/images/chibi-wave.png"
              alt=""
              className="size-full object-cover object-top"
            />
          </div>
          <div>
            <div className="sig-name">hi, I'm Sarah!</div>
            <p className="sig-body">
              I started Organized Glitter because I wanted to track both hobbies in one place, and I
              hadn't quite found a way to do it that worked well for me. Thank you for visiting!
            </p>
            <Link to="/about" className="sig-link">
              More about me <span className="arrow">-&gt;</span>
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
