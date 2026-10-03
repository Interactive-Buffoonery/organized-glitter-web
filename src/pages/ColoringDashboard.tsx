import { Navigate, useLocation } from 'react-router-dom';

const ColoringDashboard = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('craft', 'coloring');

  return (
    <Navigate
      to={{
        pathname: '/dashboard',
        search: `?${searchParams.toString()}`,
      }}
      replace
    />
  );
};

export default ColoringDashboard;
