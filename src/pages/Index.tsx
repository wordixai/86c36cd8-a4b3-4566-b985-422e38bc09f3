import { useState, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';

interface Photo {
  id: string;
  imageData: string;
  caption: string;
  date: string;
  position: { x: number; y: number };
  isDeveloping: boolean;
}

const Index = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isEjecting, setIsEjecting] = useState(false);
  const [draggedPhoto, setDraggedPhoto] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null);
  const [hoveredText, setHoveredText] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 }
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera access denied:', err);
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const generateCaption = async (imageData: string): Promise<string> => {
    const userLang = navigator.language || 'en';

    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('API key not configured');
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageData.split(',')[1]
                }
              },
              {
                type: 'text',
                text: `Generate a warm, short blessing or nice comment about this photo in ${userLang} language. Keep it under 15 words.`
              }
            ]
          }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.content[0].text;
      }
    } catch (err) {
      console.error('AI caption generation failed:', err);
    }

    return userLang.startsWith('zh') ? '美好的瞬间值得珍藏' : 'A beautiful moment captured forever';
  };

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isEjecting) return;

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = 600;
    canvas.height = 800;

    const videoAspect = video.videoWidth / video.videoHeight;
    const targetAspect = 3 / 4;

    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

    if (videoAspect > targetAspect) {
      sw = video.videoHeight * targetAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / targetAspect;
      sy = (video.videoHeight - sh) / 2;
    }

    context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);

    const photoId = Date.now().toString();
    const currentDate = new Date().toLocaleDateString(navigator.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const newPhoto: Photo = {
      id: photoId,
      imageData,
      caption: '...',
      date: currentDate,
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      isDeveloping: true
    };

    setPhotos(prev => [...prev, newPhoto]);
    setIsEjecting(true);

    setTimeout(() => setIsEjecting(false), 1000);

    generateCaption(imageData).then(caption => {
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, caption, isDeveloping: false } : p
      ));
    });
  }, [isEjecting]);

  const handleMouseDown = (e: React.MouseEvent, photoId: string) => {
    if (editingPhoto === photoId) return;

    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    setDraggedPhoto(photoId);
    setDragOffset({
      x: e.clientX - photo.position.x,
      y: e.clientY - photo.position.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggedPhoto) return;

    setPhotos(prev => prev.map(p =>
      p.id === draggedPhoto
        ? { ...p, position: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } }
        : p
    ));
  }, [draggedPhoto, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDraggedPhoto(null);
  }, []);

  useEffect(() => {
    if (draggedPhoto) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggedPhoto, handleMouseMove, handleMouseUp]);

  const downloadPhoto = async (photoId: string) => {
    const element = document.getElementById(`photo-${photoId}`);
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2
      });

      const link = document.createElement('a');
      link.download = `retro-photo-${photoId}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const deletePhoto = (photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const startEdit = (photoId: string, currentCaption: string) => {
    setEditingPhoto(photoId);
    setEditText(currentCaption);
  };

  const saveEdit = () => {
    if (editingPhoto) {
      setPhotos(prev => prev.map(p =>
        p.id === editingPhoto ? { ...p, caption: editText } : p
      ));
      setEditingPhoto(null);
    }
  };

  const cancelEdit = () => {
    setEditingPhoto(null);
    setEditText('');
  };

  const regenerateCaption = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, caption: '...' } : p
    ));

    const newCaption = await generateCaption(photo.imageData);
    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, caption: newCaption } : p
    ));
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGm98OScTgwOUKrm8LNhGgU7k9nx0H4qBSF1xe/glEILElyx6OyrWBQLQ5zh8L1rIAUsgs/z2oo3Bxdqvuz3nVEMC02o5fG0YxoFOJPY88h6KgUgdcbw3JFBChZbs+nrq1cUCkSb4PG+ayIFK4PP8dmJNggXar3s951RDAtz" />

      <h1 className="fixed top-8 left-1/2 -translate-x-1/2 text-6xl font-handwriting text-amber-900 z-10">
        Bao Retro Camera
      </h1>

      <div className="fixed bottom-8 right-8 text-right text-amber-800 font-handwriting text-lg z-10 max-w-xs">
        <p>Click the red button to capture</p>
        <p>Drag photos to arrange them</p>
        <p>Hover to edit or download</p>
      </div>

      <div className="fixed bottom-16 left-16 w-[450px] h-[450px] z-20">
        <img
          src="https://s.baoyu.io/images/retro-camera.webp"
          alt="Camera"
          className="absolute left-0 bottom-0 w-full h-full object-contain pointer-events-none"
        />

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute rounded-full object-cover"
          style={{
            bottom: '32%',
            left: '62%',
            transform: 'translateX(-50%)',
            width: '27%',
            height: '27%',
            zIndex: 30
          }}
        />

        <button
          onClick={capturePhoto}
          className="absolute opacity-0 hover:opacity-10 bg-red-500 rounded-full transition-opacity"
          style={{
            bottom: '40%',
            left: '18%',
            width: '11%',
            height: '11%',
            cursor: 'pointer',
            zIndex: 30
          }}
          aria-label="Capture photo"
        />

        {isEjecting && photos.length > 0 && (
          <div
            className="absolute animate-eject"
            style={{
              transform: 'translateX(-50%)',
              top: 0,
              left: '50%',
              width: '35%',
              height: '100%',
              zIndex: 10
            }}
          >
            <div className="bg-white shadow-2xl p-3 pb-12 relative" style={{ aspectRatio: '3/4' }}>
              <div className={`w-full bg-gray-200 transition-all duration-3000 ${photos[photos.length - 1].isDeveloping ? 'blur-xl' : 'blur-0'}`} style={{ aspectRatio: '3/4' }}>
                <img
                  src={photos[photos.length - 1].imageData}
                  alt="Developing"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {photos.map(photo => (
        <div
          key={photo.id}
          id={`photo-${photo.id}`}
          className="fixed cursor-move select-none"
          style={{
            left: photo.position.x,
            top: photo.position.y,
            transform: 'translate(-50%, -50%)',
            zIndex: draggedPhoto === photo.id ? 100 : 50
          }}
          onMouseDown={(e) => handleMouseDown(e, photo.id)}
          onMouseEnter={() => setHoveredPhoto(photo.id)}
          onMouseLeave={() => setHoveredPhoto(null)}
        >
          <div className="bg-white shadow-2xl p-4 pb-16 relative" style={{ width: '240px' }}>
            <div className={`w-full bg-gray-200 transition-all duration-3000 ${photo.isDeveloping ? 'blur-xl opacity-50' : 'blur-0 opacity-100'}`} style={{ aspectRatio: '3/4' }}>
              <img
                src={photo.imageData}
                alt="Captured moment"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="absolute bottom-4 left-4 right-4 font-handwriting text-gray-700">
              <p className="text-xs mb-1">{photo.date}</p>
              <div
                className="relative"
                onMouseEnter={() => setHoveredText(photo.id)}
                onMouseLeave={() => setHoveredText(null)}
                onDoubleClick={() => startEdit(photo.id, photo.caption)}
              >
                {editingPhoto === photo.id ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === 'Escape') {
                        cancelEdit();
                      }
                    }}
                    className="w-full text-sm bg-yellow-50 border border-amber-300 rounded px-1 py-1 font-handwriting resize-none"
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <>
                    <p className="text-sm leading-tight">{photo.caption}</p>
                    {hoveredText === photo.id && !photo.isDeveloping && (
                      <div className="absolute -top-8 right-0 flex gap-1 bg-white rounded shadow-lg p-1">
                        <button
                          onClick={() => startEdit(photo.id, photo.caption)}
                          className="p-1 hover:bg-amber-100 rounded"
                          title="Edit caption"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => regenerateCaption(photo.id)}
                          className="p-1 hover:bg-amber-100 rounded"
                          title="Regenerate caption"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {hoveredPhoto === photo.id && !photo.isDeveloping && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex gap-2 bg-white rounded-lg shadow-lg p-2">
                <button
                  onClick={() => downloadPhoto(photo.id)}
                  className="p-2 hover:bg-amber-100 rounded"
                  title="Download photo"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  onClick={() => deletePhoto(photo.id)}
                  className="p-2 hover:bg-red-100 rounded text-red-600"
                  title="Delete photo"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Index;
