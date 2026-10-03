import React from 'react';

const ProfileHeader: React.FC = () => {
  return (
    <div className="mb-8">
      <div className="flex w-full flex-col">
        <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
          Profile & Settings
        </h1>
      </div>
    </div>
  );
};

export default ProfileHeader;
