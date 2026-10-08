import { swimResourcesAsset } from '../lib/routes.ts';
import Image from 'next/image';

export default function FlipLogo() {
  return (
    <div>
      <div className="theme-light-only">
        <Image
          src={swimResourcesAsset("/main.svg")}
          alt="Velocity Logo"
          width={300}
          height={90}
          priority
          className="max-w-full h-auto"
          style={{ width: 'auto', height: 'auto' }}
        />
      </div>
      <div className="theme-dark-only">
        <Image
          src={swimResourcesAsset("/white.svg")}
          alt="Velocity Logo"
          width={300}
          height={90}
          priority
          className="max-w-full h-auto"
          style={{ width: 'auto', height: 'auto' }}
        />
      </div>
    </div>
  );
}
