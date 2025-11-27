import './App.css';
import PortkeyProvider from './provider/Portkey';
import Home from './pages/Home';
import '../polyfill';

function App() {
  return (
    <PortkeyProvider>
      <Home />
    </PortkeyProvider>
  );
}

export default App;
